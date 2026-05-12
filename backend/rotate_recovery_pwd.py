"""Rotate the Treasury Recovery password.

Usage:
    python rotate_recovery_pwd.py <new_password>

Updates TREASURY_RECOVERY_PASSWORD_HASH in /app/backend/.env in-place.
"""
import sys
import bcrypt
from pathlib import Path

ENV_PATH = Path(__file__).parent / ".env"
KEY = "TREASURY_RECOVERY_PASSWORD_HASH"


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python rotate_recovery_pwd.py <new_password>")
        return 1
    new_pwd = sys.argv[1]
    new_hash = bcrypt.hashpw(new_pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    lines = ENV_PATH.read_text().splitlines() if ENV_PATH.exists() else []
    updated = False
    for i, line in enumerate(lines):
        if line.startswith(f"{KEY}="):
            lines[i] = f"{KEY}='{new_hash}'"
            updated = True
            break
    if not updated:
        lines.append(f"{KEY}='{new_hash}'")

    ENV_PATH.write_text("\n".join(lines) + "\n")
    print(f"✓ {KEY} rotated. Restart the backend (`sudo supervisorctl restart backend`) to apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
