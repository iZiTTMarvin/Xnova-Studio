from __future__ import annotations

from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[3]
SPEC_ROOT = REPO_ROOT / ".trellis" / "spec"


class SpecBootstrapTests(unittest.TestCase):
    def test_backend_special_specs_exist_and_are_indexed(self) -> None:
        backend_dir = SPEC_ROOT / "backend"
        index_content = (backend_dir / "index.md").read_text(encoding="utf-8")

        required_specs = [
            "runtime-boundary.md",
            "config-toml-migration.md",
            "agent-schema-v1.md",
        ]

        for name in required_specs:
            self.assertTrue((backend_dir / name).is_file(), msg=f"missing backend special spec: {name}")
            self.assertIn(name, index_content)

    def test_layer_indexes_have_required_sections(self) -> None:
        for layer in ("backend", "frontend"):
            content = (SPEC_ROOT / layer / "index.md").read_text(encoding="utf-8")
            self.assertIn("## Pre-Development Checklist", content)
            self.assertIn("## Quality Check", content)

    def test_layer_specs_no_longer_have_placeholder_text(self) -> None:
        placeholder_markers = [
            "(To be filled by the team)",
            "To fill",
            "<!-- Replace with your actual structure -->",
        ]

        for layer in ("backend", "frontend"):
            for path in (SPEC_ROOT / layer).glob("*.md"):
                content = path.read_text(encoding="utf-8")
                for marker in placeholder_markers:
                    self.assertNotIn(marker, content, msg=f"{path} still contains placeholder: {marker}")


if __name__ == "__main__":
    unittest.main()
