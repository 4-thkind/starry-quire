import subprocess
import sys
import os

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode != 0:
        print(f"Error running: {cmd}")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        sys.exit(result.returncode)
    return result.stdout.strip()

def main():
    status = run_cmd("git status -uall --porcelain")
    if not status:
        print("No files to commit.")
        return

    lines = status.splitlines()
    files = []
    for line in lines:
        if not line.strip():
            continue
        # Format is XY filepath
        # line[:2] is status, line[3:] is file path (may be quoted if containing spaces/special characters)
        file_path = line[3:].strip()
        if file_path.startswith('"') and file_path.endswith('"'):
            file_path = file_path[1:-1]
        files.append(file_path)

    print(f"Found {len(files)} files to add, commit, and push individually:")
    for f in files:
        print(f" - {f}")

    for idx, f in enumerate(files, 1):
        print(f"\n[{idx}/{len(files)}] Processing: {f}")
        # Add
        run_cmd(f'git add -- "{f}"')
        
        # Commit message
        base_name = os.path.basename(f)
        commit_msg = f"Add {f}"
        run_cmd(f'git commit -m "{commit_msg}"')
        
        # Push
        print(f"Pushing commit for: {f}")
        push_out = run_cmd("git push origin main")
        if push_out:
            print(push_out)

    print("\nAll files committed and pushed individually successfully!")

if __name__ == '__main__':
    main()

