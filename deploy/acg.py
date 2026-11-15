"""Temporarily allow one deployment runner's SSH access to NAVER Cloud VPC."""

import argparse
import base64
import hashlib
import hmac
import ipaddress
import json
import os
import time
import urllib.parse
import urllib.request


def request(action, **parameters):
    parameters = {
        "regionCode": os.environ.get("NCP_REGION_CODE", "KR"),
        "accessControlGroupNo": os.environ["NCP_ACG_NO"],
        "responseFormatType": "json",
        **parameters,
    }
    path = f"/vserver/v2/{action}?{urllib.parse.urlencode(parameters)}"
    timestamp = str(int(time.time() * 1000))
    access_key = os.environ["NCP_ACCESS_KEY_ID"]
    message = f"GET {path}\n{timestamp}\n{access_key}".encode()
    signature = base64.b64encode(hmac.new(
        os.environ["NCP_SECRET_KEY"].encode(), message, hashlib.sha256
    ).digest()).decode()
    req = urllib.request.Request("https://ncloud.apigw.ntruss.com" + path, headers={
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-iam-access-key": access_key,
        "x-ncp-apigw-signature-v2": signature,
    })
    with urllib.request.urlopen(req, timeout=20) as response:
        result = json.load(response)[action + "Response"]
    if str(result.get("returnCode")) != "0":
        raise RuntimeError(f"{action} failed: {result.get('returnCode')}")
    return result


def manage(action, address):
    ip = ipaddress.IPv4Address(address)
    if not ip.is_global:
        raise ValueError("A public IPv4 address is required")
    block = f"{ip}/32"
    port = str(int(os.environ.get("NCP_SERVER_PORT", "22")))
    if not 1 <= int(port) <= 65535:
        raise ValueError("Invalid SSH port")
    owner = "tourpass-cd-" + os.environ["GITHUB_RUN_ID"]
    rules = request("getAccessControlGroupRuleList")["accessControlGroupRuleList"]
    existing = [r for r in rules if r["accessControlGroupRuleType"]["code"] == "INBND"
                and r["protocolType"]["code"] == "TCP"
                and r["ipBlock"] == block and r["portRange"] == port]
    if action == "open" and existing:
        print("Exact SSH rule already exists; leaving it unchanged")
        return
    if action == "close" and not any(
        r.get("accessControlGroupRuleDescription") == owner for r in existing
    ):
        print("No SSH rule owned by this run remains")
        return
    parameters = {
        "vpcNo": os.environ["NCP_VPC_NO"],
        "accessControlGroupRuleList.1.protocolTypeCode": "TCP",
        "accessControlGroupRuleList.1.ipBlock": block,
        "accessControlGroupRuleList.1.portRange": port,
    }
    if action == "open":
        parameters["accessControlGroupRuleList.1.accessControlGroupRuleDescription"] = owner
    method = "add" if action == "open" else "remove"
    request(method + "AccessControlGroupInboundRule", **parameters)
    print(f"{action}: SSH {port} for {block} ({owner})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["open", "close"])
    parser.add_argument("address")
    args = parser.parse_args()
    manage(args.action, args.address)
