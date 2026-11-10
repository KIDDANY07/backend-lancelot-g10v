import platform
from importlib import metadata

TRACKED_LIBRARIES = ("scikit-learn", "numpy", "pandas", "joblib", "scipy")


def library_versions() -> dict[str, str]:
    versions = {"python": platform.python_version()}
    for name in TRACKED_LIBRARIES:
        try:
            versions[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            versions[name] = "no instalada"
    return versions


def version_differences(saved: dict[str, str] | None) -> dict[str, tuple[str, str]]:
    if not saved:
        return {}
    current = library_versions()
    return {
        name: (saved[name], current.get(name, "no instalada"))
        for name in saved
        if name != "python" and saved[name] != current.get(name)
    }
