import argparse
import io
import os
import unittest
from unittest.mock import patch

from absolute_privacy.backup import backup_export
from absolute_privacy.cli import _backup_passphrase


class BackupPassphraseTests(unittest.TestCase):
    def test_python_bridge_sends_passphrase_over_stdin_not_argv(self) -> None:
        with patch("absolute_privacy.backup.run_js_cli") as run:
            run.return_value = {"ok": True}
            backup_export(
                notes_file="notes.json",
                passphrase="do-not-log-me",
                out="backup.apbackup",
            )
        args = run.call_args.args[0]
        self.assertNotIn("do-not-log-me", args)
        self.assertIn("--passphrase-stdin", args)
        self.assertEqual(run.call_args.kwargs["input_text"], "do-not-log-me\n")

    def test_env_source(self) -> None:
        args = argparse.Namespace(passphrase=None, passphrase_stdin=False)
        with patch.dict(os.environ, {"AP_BACKUP_PASSPHRASE": "from-env"}, clear=False):
            self.assertEqual(_backup_passphrase(args), "from-env")

    def test_stdin_source(self) -> None:
        args = argparse.Namespace(passphrase=None, passphrase_stdin=True)
        with patch.dict(os.environ, {}, clear=True), patch(
            "sys.stdin", io.StringIO("from-stdin\n")
        ):
            self.assertEqual(_backup_passphrase(args), "from-stdin")

    def test_legacy_argv_remains_compatible_and_warns(self) -> None:
        args = argparse.Namespace(passphrase="legacy", passphrase_stdin=False)
        with patch.dict(os.environ, {}, clear=True), self.assertWarns(FutureWarning):
            self.assertEqual(_backup_passphrase(args), "legacy")


if __name__ == "__main__":
    unittest.main()
