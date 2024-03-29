#!/usr/bin/env node
import { firefox } from 'playwright';
import { expect } from '@playwright/test';
import { read } from 'read';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import chalk from 'chalk';

/**
 * vpn-slice parameter: list of private networks and hostnames.
 */
const DEFAULT_PRIVATE_NETWORKS = `
10.72.0.0/16 10.36.0.0/16 10.20.0.0/16 10.26.0.0/16 134.174.12.0/24 134.174.13.0/24 10.7.34.0/24
pangea centurion titan rc-live rc-golden chris-next galena fnndsc.tch.harvard.edu fnndsc.childrens.harvard.edu
web2.tch.harvard.edu chbwiki.tch.harvard.edu rc-gitlab.chboston.org hrprd.tch.harvard.edu
`;

/**
 * Functions for handling the Duo 2-factor authentication.
 */
const DUO_HANDLERS = {
  auto: async (page) => undefined,
  // WARNING: I no longer use SMS so this is untested
  sms: async (page) => {
    const frame = page.frameLocator('#tp_frame').first();

    await expect(frame.getByText('Text me new codes')).toBeAttached();
    await frame.getByText('Text me new codes').click();
    await expect(frame.getByText('Successfully sent codes.')).toBeAttached();

    const activeAuthMethod = frame.locator('#auth_methods fieldset:not(.hidden)');
    await expect(activeAuthMethod.getByText('Enter a Passcode')).toBeAttached();
    await activeAuthMethod.getByText('Enter a Passcode').click();
    await activeAuthMethod.locator('input.passcode-input[name="passcode"]').fill(await getInput());
    await activeAuthMethod.locator('#passcode').click();
  }
}

const { values } = parseArgs({
  options: {
    'private-networks': {
      type: 'string',
      default: DEFAULT_PRIVATE_NETWORKS
    },
    'append-network': {
      type: 'string',
      multiple: true,
      short: 'a',
      default: []
    },
    'no-vpn-slice': {
      type: 'boolean'
    },
    'duo': {
      type: 'string',
      default: 'auto'
    },
    username: {
      type: 'string',
      short: 'u'
    },
    password: {
      type: 'string',
      short: 'p'
    },
    help: {
      type: 'boolean',
      short: 'h'
    }
  }
});

const PROG = process.argv[0].endsWith('node') ? `${process.argv[0]} ${process.argv[1]}` : process.argv[0];
const HELP = `usage: ${PROG}

Connect to the Boston Children's Hospital VPN.

options:

  -h, --help                          show this help message and exit
  --private-networks <NETWORKS_LIST>  set company-internal private networks (vpn-slice arguments)
  -a, --append-network <NETWORK>      append a private network or hostname (vpn-slice argument). This option may be repeated.
  -duo {auto,sms}                     Duo 2FA method. Either "auto" meaning "automatic push notification" or "sms" to send passcode to first-registered SMS.
  -u, --username                      Username
  -p, --password                      Password

Contact: dev@babymri.org
`;

if (Object.keys(DUO_HANDLERS).findIndex((name) => name === values.duo) === -1) {
  console.log(`error: --duo=${values.duo} not supported. Valid values include: ${Object.keys(DUO_HANDLERS)}`);
  process.exit(1);
}

if (values.help) {
  console.log(HELP);
  process.exit(1);
}

(async () => {
  const browser = await firefox.launch();
  const page = await browser.newPage();

  // Fill login page with credentials, then click "Sign In" button
  await page.goto('https://vpn.childrens.harvard.edu/dana-na/auth/url_5/welcome.cgi');
  await page.locator('#username').fill(values['username'] || await read({prompt: 'Username: '}));
  await page.locator('#password').fill(values['password'] || await read({prompt: 'Password: ', silent: true}));
  console.log();
  await page.click('#btnSubmit_6');

  // Assert that Duo login pops up
  await expect
    .poll(
      async () => await page.locator('#tp_frame').getAttribute('src'),
      { timeout: 10_000 }
    )
    .toEqual(expect.stringContaining('api-9eb61ca3.duosecurity.com/frame/juniper/v2/auth'));
  console.error(chalk.dim('Waiting for Duo 2FA'));

  // handle Duo 2FA
  // TODO select Duo handler based on text instead of cli option
  DUO_HANDLERS[values.duo](page);

  // Handle "open sessions" and DSID cookie retrieval simultaneously
  const finishPollingForStaleSessionPage = safePollStaleSessionPage(page);
  console.error(chalk.dim('Getting DSID cookie'));
  const dsid = await pollforCookie(page, 'DSID');
  await finishPollingForStaleSessionPage();

  await browser.close();
  connectToVpn(
    'https://vpn.childrens.harvard.edu',
    dsid,
    values['no-vpn-slice'] ? [] : values['private-networks'].split(/\s/).filter((s) => s !== '').concat(values['append-network'])
  );
})();

async function pollforCookie(page, cookieName) {
  await expect.poll(
    async () => {
      const cookies = await page.context().cookies();
      return cookies.map((cookie) => cookie.name);
    },
    {
      intervals: [1_000],
      timeout: 60_000
    }
  ).toContain(cookieName);

  const cookies = await page.context().cookies();
  const cookie = cookies.find((cookie) => cookie.name === cookieName);
  return cookie.value;
}

function safePollStaleSessionPage(page) {
  const channel = { waiting: true };
  const promise = _staleSessionPollingLoop(page, channel);
  return async () => {
    channel.waiting = false;
    await promise;
  };
}

async function _staleSessionPollingLoop(page, channel) {
  let closedStaleSession = false;
  while (channel.waiting && !closedStaleSession) {
    await sleep(500);
    if (await isOnStaleSessionPage(page)) {
      // console.error(chalk.dim('_staleSessionPollingLoop: stale session found'));
      await passStaleSessionPage(page);
      console.error(chalk.dim('_staleSessionPollingLoop: stale session CLOSED'));
      closedStaleSession = true;
    }
    // else {
    //   console.error(chalk.dim('_staleSessionPollingLoop: stale session not found'));
    // }
  }
  // console.error(chalk.dim('_staleSessionPollingLoop: finished'));
}

function sleep(ms) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
}

async function isOnStaleSessionPage(page) {
  try {
    await expect(page.getByText('Close Selected Sessions and Log in')).toBeAttached();
    return true;
  } catch (e) {
    return false;
  }
}

async function passStaleSessionPage(page) {
  await page.locator('#postfixSID_1').check();
  await expect(page.getByText('Close Selected Sessions and Log in')).toBeEnabled();
  await page.getByText('Close Selected Sessions and Log in').click();
}

function connectToVpn(vpnUrl, dsid, vpnSliceArguments) {
  const s = vpnSliceArguments.length === 0 ? [] : ['-s', 'vpn-slice ' + vpnSliceArguments.join(' ')];
  const cmd = ['openconnect', '--protocol=nc', '--cookie', dsid, ...s, vpnUrl];
  execFileSync('sudo', cmd, { stdio: 'inherit' });
}
