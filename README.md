# openconnect-bch

This is a set of scripts for connecting to the Boston Children's Hospital VPN
using open-source, privacy-friendly, CLI-first, and secure software.
More generally, it provides a solution for connecting to a commercial VPN service
called "Pulse Connect Secure" aka "Ivanti" that requires 2-factor authorization
with Duo.

See also: https://gitlab.com/openconnect/openconnect/-/issues/636

## Assumptions

It is assumed that you use SMS authorization as the default. Currently, Duo app 2FA is not supported.

## Split-Tunneling

These scripts implement both split-tunneling and split-DNS, which means they will use VPN routes only
when necessary. For example, trying to reach http://web2.tch.harvard.edu will go over the VPN as expected.
However, going to https://wikipedia.org or taking a Zoom call will not go over the VPN connection, which
is better for both privacy and performance.

## How It Works

`connect.py` is a simple Python script which runs `bchvpn.spec.ts` using [Playwright](https://playwright.dev/).
Playwright is a JavaScript system for browser testing of web apps, which runs (a headless instance of) Firefox
in the background. `bchvpn.spec.ts` opens https://vpn.childrens.harvard.edu in the Firefox instance, then requests
data from `connect.py`. `connect.py` prompts for user input and sends data to `bchvpn.spec.ts` over an HTTP server.
`bchvpn.spec.ts` fills in the HTML forms appearing on https://vpn.childrens.harvard.edu.

Currently, `connect.py` and `bchvpn.spec.ts` are hard-coded to ask for:

1. Username
2. Password
3. Duo passcode

## Depencencies

- [openconnect](https://gitlab.com/openconnect/openconnect)
- [vpn-slice](https://github.com/dlenski/vpn-slice)
- Python v3.9 or later
- Node.JS v21.5.0
- [pnpm](https://pnpm.io/)
- Check the [Playwright system requirements](https://playwright.dev/docs/intro#system-requirements)
- systemd-resolved (for DNS)

## Installation

> [!WARNING]  
> We'll need `sudo` because `vpn-slice` writes to `/etc/hosts` and `openconnect` needs `cap_net_admin+ep`

```shell
git clone https://github.com/FNNDSC/openconnect-bch.git
cd openconnect-bch

pnpm i
sudo pnpm exec playwright install firefox
```

## Usage

```shell
sudo python connect.py
```

If using `systemd-resolved`, after a connection is established, run

```shell
./dnsup.sh  # sudo is optional here thanks to polkit
```

Otherwise, figure out DNS on your own.

## Configuration

`vpn-slice` can be configured by the `PRIVATE_SUBNETS` variable of `connect.py`. You can add hostnames to it, see
https://github.com/dlenski/vpn-slice#usage
