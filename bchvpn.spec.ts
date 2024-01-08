import { test, expect } from '@playwright/test';
import * as http from 'node:http';
import * as fs from 'node:fs/promises';

const DUO_IFRAME_POLL_OPTIONS = {
  intervals: [1_000],
  timeout: 30_000
}

let server = null;
let lastInput = null;


test.beforeAll(async () => {
  server = createEchoServer().listen(process.env.OPENCONNECTBCH_PORT);
});

test.afterAll(async () => {
  server.close();
});

test('Connect to vpn.childrens.harvard.edu', async ({ page }) => {
  await page.goto('https://vpn.childrens.harvard.edu/dana-na/auth/url_5/welcome.cgi');
  await page.locator('#username').fill(await getInput());
  await page.locator('#password').fill(await getInput());
  await page.click('#btnSubmit_6');


  await expect
    .poll(
      async () => await page.locator('#tp_frame').getAttribute('src'),
      DUO_IFRAME_POLL_OPTIONS
    )
    .toEqual(expect.stringContaining('api-9eb61ca3.duosecurity.com/frame/juniper/v2/auth'));

  const frame = page.frameLocator('#tp_frame').first();

  await expect(frame.getByText('Text me new codes')).toBeAttached();
  await frame.getByText('Text me new codes').click();
  await expect(frame.getByText('Successfully sent codes.')).toBeAttached();

  const activeAuthMethod = frame.locator('#auth_methods fieldset:not(.hidden)');
  await expect(activeAuthMethod.getByText('Enter a Passcode')).toBeAttached();
  await activeAuthMethod.getByText('Enter a Passcode').click();
  await activeAuthMethod.locator('input.passcode-input[name="passcode"]').fill(await getInput());
  await activeAuthMethod.locator('#passcode').click();

  await expect.poll(
    async () => {
      const cookies = await page.context().cookies();
      return cookies.map((cookie) => cookie.name);
    },
    DUO_IFRAME_POLL_OPTIONS
  ).toContain('DSID');

  const cookies = await page.context().cookies();
  const dsid = cookies.find((cookie) => cookie.name === 'DSID');
  await fs.writeFile(process.env.OPENCONNECTBCH_DSIDFILE, dsid.value);
});


function createEchoServer() {
  return http
    .createServer(async (req, res) => {
      const bodyBuffer = [];
      req
        .on('error', (err) => {
          console.error(err);
        })
        .on('data', (chunk) => {
          bodyBuffer.push(chunk);
        })
        .on('end', () => {
          lastInput = Buffer.concat(bodyBuffer).toString();
          res.writeHead(200);
          res.end();
        });
    });
}

async function getInput(): Promise<string> {
  while (typeof lastInput !== "string") {
    await sleep(500);
  }
  const value = lastInput;
  lastInput = null;
  return value;
}

function sleep(ms: number): Promise<undefined> {
  return new Promise((r) => setTimeout(r, ms));
}
