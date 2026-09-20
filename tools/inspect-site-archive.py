"""Inspect a deployment tar without extracting files or following links."""
import hashlib
import json
import sys
import tarfile


def inspect(path):
    files = {}
    seen = set()
    total = 0
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            name = member.name
            if name.startswith("./"):
                name = name[2:]
            if name in ("", ".") and member.isdir():
                continue
            name = name.rstrip("/") if member.isdir() else name
            if (not name or "\\" in name or ":" in name
                    or any(part in ("", ".", "..") for part in name.split("/"))
                    or name in seen or len(seen) >= 10000):
                raise ValueError("Unsafe or duplicate archive path")
            seen.add(name)
            if member.isdir():
                continue
            if not member.isfile() or member.size > 32 * 1024 * 1024:
                raise ValueError("Archive requires bounded regular files")
            total += member.size
            if total > 512 * 1024 * 1024:
                raise ValueError("Archive is too large")
            capture = name in ("assets/retained-releases.json", "next/relay-forge/index.html",
                               "deployment-check/previous-shell.html", "deployment-check/previous-shell.json")
            if capture and member.size > 2 * 1024 * 1024:
                raise ValueError("Manifest or shell is too large")
            digest = hashlib.sha256()
            chunks = []
            size = 0
            with archive.extractfile(member) as source:
                while chunk := source.read(65536):
                    digest.update(chunk)
                    size += len(chunk)
                    if capture:
                        chunks.append(chunk)
            if size != member.size:
                raise ValueError("Truncated archive member")
            files[name] = {"size": size, "sha256": digest.hexdigest()}
            if capture:
                files[name]["text"] = b"".join(chunks).decode("utf-8")
    return files


if __name__ == "__main__":
    try:
        print(json.dumps(inspect(sys.argv[1])))
    except Exception:
        sys.exit("Invalid deployment archive; no files were extracted.")
