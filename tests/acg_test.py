import base64
import hashlib
import hmac
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("acg", Path(__file__).parents[1] / "deploy/acg.py")
acg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acg)


class AcgTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "NCP_REGION_CODE": "KR", "NCP_ACG_NO": "123", "NCP_VPC_NO": "456",
            "NCP_SERVER_PORT": "22", "GITHUB_RUN_ID": "789",
            "NCP_ACCESS_KEY_ID": "test-access", "NCP_SECRET_KEY": "test-secret",
        })
        self.env.start()
        self.addCleanup(self.env.stop)

    def rule(self, owner):
        return {"accessControlGroupRuleType": {"code": "INBND"},
                "protocolType": {"code": "TCP"}, "ipBlock": "8.8.8.8/32",
                "portRange": "22", "accessControlGroupRuleDescription": owner}

    def test_open_limits_access_to_single_ip_and_ssh(self):
        with patch.object(acg, "request", return_value={"accessControlGroupRuleList": []}) as call:
            acg.manage("open", "8.8.8.8")
        args, params = call.call_args
        self.assertEqual(args, ("addAccessControlGroupInboundRule",))
        self.assertEqual(params["accessControlGroupRuleList.1.ipBlock"], "8.8.8.8/32")
        self.assertEqual(params["accessControlGroupRuleList.1.portRange"], "22")
        self.assertEqual(params["accessControlGroupRuleList.1.accessControlGroupRuleDescription"], "tourpass-cd-789")

    def test_existing_rule_is_neither_added_nor_removed(self):
        for action in ["open", "close"]:
            with patch.object(acg, "request", return_value={"accessControlGroupRuleList": [self.rule("admin")]}) as call:
                acg.manage(action, "8.8.8.8")
                self.assertEqual(call.call_count, 1)

    def test_close_only_removes_owned_rule(self):
        with patch.object(acg, "request", return_value={"accessControlGroupRuleList": [self.rule("tourpass-cd-789")]}) as call:
            acg.manage("close", "8.8.8.8")
        self.assertEqual(call.call_args.args, ("removeAccessControlGroupInboundRule",))

    def test_rejects_networks_and_private_ips_before_api_call(self):
        for address in ["0.0.0.0/0", "8.8.8.8/24", "127.0.0.1", "::1"]:
            with patch.object(acg, "request") as call, self.assertRaises(ValueError):
                acg.manage("open", address)
            call.assert_not_called()

    def test_request_is_signed_and_api_failure_is_not_success(self):
        response = {"getAccessControlGroupRuleListResponse": {"returnCode": "0", "accessControlGroupRuleList": []}}
        with patch.object(acg.time, "time", return_value=1), patch.object(acg.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(response).encode())) as call:
            acg.request("getAccessControlGroupRuleList")
        req = call.call_args.args[0]
        path = req.full_url.removeprefix("https://ncloud.apigw.ntruss.com")
        expected = base64.b64encode(hmac.new(b"test-secret", f"GET {path}\n1000\ntest-access".encode(), hashlib.sha256).digest()).decode()
        self.assertEqual(req.get_header("X-ncp-apigw-signature-v2"), expected)
        response["getAccessControlGroupRuleListResponse"]["returnCode"] = "1"
        with patch.object(acg.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(response).encode())), self.assertRaises(RuntimeError):
            acg.request("getAccessControlGroupRuleList")


if __name__ == "__main__":
    unittest.main()
