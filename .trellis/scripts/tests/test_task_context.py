from __future__ import annotations

import sys
from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / ".trellis" / "scripts"))

from common.task_context import get_check_context  # noqa: E402


class TaskContextTests(unittest.TestCase):
    def test_get_check_context_only_references_existing_files(self) -> None:
        entries = get_check_context(REPO_ROOT)

        missing_files = [
            entry["file"]
            for entry in entries
            if not (REPO_ROOT / entry["file"]).is_file()
        ]

        self.assertEqual(missing_files, [])


if __name__ == "__main__":
    unittest.main()
