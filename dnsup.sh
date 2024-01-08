#!/bin/bash -ex
# Sets tun0 to use the Boston Children's Hospital DNS servers.

function get_default_nic () {
  ip route show | grep default | head -n 1 | awk '{print $5}'
}

# append ~. to the domains of a NIC, which indicates the NIC's DNS servers are preferred for all domains.
function domain_append_tildedot () {
  local other=$(resolvectl domain "$1" | sed 's/Link .*://' | tr ' ' '\n' | grep -v '^ *$' | grep -v '^~\.$')
  resolvectl domain "$1" $other '~.'
}

# set BCH's DNS servers on the VM's NIC on the host
resolvectl dns 'tun0' 134.174.12.1 134.174.12.2
# set search suffixes to resolve hostnames e.g. "rcwiki" -> "rcwiki.tch.harvard.edu"
resolvectl domain 'tun0' 'tch.harvard.edu' 'chboston.org'
# prefer default NIC's DNS servers, so that DNS queries for public URLs such as google.com are not sent to BCH's servers
domain_append_tildedot "$(get_default_nic)"
