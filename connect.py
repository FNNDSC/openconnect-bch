import os
import random
from argparse import ArgumentParser
from tempfile import NamedTemporaryFile
import urllib.request
import subprocess as sp
from pathlib import Path
from typing import Optional, AnyStr, Callable
from getpass import getpass

PRIVATE_SUBNETS = '10.72.0.0/16 10.36.0.0/16 10.20.0.0/16 10.26.0.0/16 134.174.12.0/24 134.174.13.0/24 10.7.34.0/24'
"""
Space-separated list of internal subnets.
"""

VPN_URL = 'https://vpn.childrens.harvard.edu'


def connect_to_bch_vpn(given_username: Optional[str], given_password: Optional[str]):
    playwright_proc, dsid_file, ipc_server = run_playwright_in_background()
    send_data('http://localhost:8080', data=use_or_input('Username: ', given_username))
    send_data('http://localhost:8080', data=use_or_input('Password: ', given_password, getpass))
    send_data('http://localhost:8080', data=input('Duo passcode (from SMS): '))
    playwright_proc.wait()
    dsid_value = dsid_file.read_text().strip()
    openconnect_with(dsid_value)


def openconnect_with(dsid: str):
    cmd = ['openconnect', '--protocol=nc', '--cookie', dsid, '-s', f'vpn-slice {PRIVATE_SUBNETS}', VPN_URL]
    sp.run(cmd, check=True)


def use_or_input(prompt: str, val: Optional[str], input: Callable[[str], str] = input) -> str:
    if val is not None:
        return val
    return input(prompt)


def run_playwright_in_background() -> tuple[sp.Popen, Path, str]:
    dsid_file = tmp_file()
    port = random_port()
    env = {'OPENCONNECTBCH_DSIDFILE': str(dsid_file), 'OPENCONNECTBCH_PORT': str(port) ,**os.environ}
    return sp.Popen(['pnpm', 'run', '--silent', 'playwright'], env=env,
                    stdin=sp.DEVNULL), dsid_file, f'http://localhost:{port}'


def random_port() -> int:
    return random.randint(20000, 90000)


def tmp_file() -> Path:
    with NamedTemporaryFile() as t:
        pass
    return Path(t.name)


def send_data(url: str, data: AnyStr | None = None, method: str = 'POST'):
    if type(data) is str:
        data = data.encode('utf-8')
    req = urllib.request.Request(url, data=data, method=method)
    with urllib.request.urlopen(req) as res:
        pass
    if res.status != 200:
        raise Exception('Status is {res.status}. (Maybe the playwright process died?)')


def main():
    parser = ArgumentParser(description='CLI script for connecting to BCH VPN')
    parser.add_argument('-u', '--username')
    parser.add_argument('-p', '--password')
    options = parser.parse_args()
    connect_to_bch_vpn(options.username, options.password)


if __name__ == '__main__':
    main()
