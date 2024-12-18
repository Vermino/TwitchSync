#!/usr/bin/env python3
"""
File and Directory Extractor with Cleanup and AI-Optimized Diff

This script can generate AI-friendly diffs of modified files and extract content from specified files.
All output is stored in the z_extracts directory with proper file management.
Maintains separate structure files for the complete codebase and processed files.

Usage:
    python content.py <file1> <file2> ... [--strip-comments]
    python content.py --git-modified [--strip-comments]
    python content.py --git-modified --diff-for-ai

Example:
    python content.py frontend/src/components/Modal.tsx backend/src/routes/api.ts
    python content.py --git-modified --diff-for-ai
"""

import os
import re
import argparse
import json
import glob
import subprocess
from datetime import datetime
from difflib import unified_diff
import ast
import textwrap
import shutil
import sys
from pathlib import Path
import fnmatch

# File types to be processed (can be customized)
FILE_TYPES = [".py", ".txt", ".md", ".js", ".html", ".css", ".cs", ".sln", ".csproj",
              ".raw", ".xaml", ".tsx", ".ts", ".json", ".yml", ".yaml", ".sh", ".bash",
              ".java", ".cpp", ".c", ".h", ".hpp", ".go", ".rs", ".sql", ".php"]

# Directories to exclude
EXCLUDE_DIRS = {"External", "venv", ".venv", "build", ".git", ".idea", "node_modules",
                "__pycache__", "dist", "bin", "obj", "target", "build", "deps"}

# File exclusions
EXCLUDE_FILES = {"package-lock.json", "content.py", "README.md", ".DS_Store",
                 "Thumbs.db", ".env", "requirements.txt", "yarn.lock", "package.json"}

# Maximum file size for content extraction (1MB)
MAX_FILE_SIZE = 1000000  # 1MB

# Constants for file management
EXTRACT_DIR = "z_extracts"
COMMAND_LOG = "command_history.txt"
OUTPUT_FILE_PATTERNS = [
    "extracted_content_*.json",
    "ai_diff_*.json",
    "command_history.txt",
    "codebase-file-structure.json",
    "processed-files-structure.json"
]


def ensure_extract_directory():
    """Ensure the z_extracts directory exists."""
    if not os.path.exists(EXTRACT_DIR):
        os.makedirs(EXTRACT_DIR)


def log_command():
    """Log the current command to the command history file."""
    command = " ".join(sys.argv)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_path = os.path.join(EXTRACT_DIR, COMMAND_LOG)

    with open(log_path, 'a', encoding='utf-8') as f:
        f.write(f"[{timestamp}] {command}\n")


def cleanup_old_files(file_prefix):
    """Remove old files with the given prefix from z_extracts directory."""
    pattern = os.path.join(EXTRACT_DIR, f"{file_prefix}_*.json")
    for old_file in glob.glob(pattern):
        os.remove(old_file)


def parse_gitignore():
    """Parse .gitignore file and return list of patterns."""
    gitignore_patterns = set()
    try:
        with open('.gitignore', 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    # Convert the gitignore pattern to a regex pattern
                    pattern = line.replace('.', r'\.').replace('*', '.*').replace('?', '.')
                    if not line.startswith('/'):
                        pattern = f".*{pattern}"
                    gitignore_patterns.add(pattern)
    except FileNotFoundError:
        pass
    return gitignore_patterns


def is_output_file(path):
    """Check if the file is one of our output files."""
    filename = os.path.basename(path)
    return any(fnmatch.fnmatch(filename, pattern) for pattern in OUTPUT_FILE_PATTERNS)


def is_ignored(path):
    """Check if the path should be ignored based on exclusion lists and gitignore patterns."""
    # Always ignore our output files
    if EXTRACT_DIR in path or is_output_file(path):
        return True

    # Check against EXCLUDE_DIRS and EXCLUDE_FILES
    if any(exclude in path for exclude in EXCLUDE_DIRS) or \
            any(path.endswith(file) for file in EXCLUDE_FILES):
        return True

    # Check against gitignore patterns
    gitignore_patterns = getattr(is_ignored, 'gitignore_patterns', None)
    if gitignore_patterns is None:
        gitignore_patterns = is_ignored.gitignore_patterns = parse_gitignore()

    rel_path = os.path.normpath(path).replace(os.sep, '/')
    return any(re.match(pattern, rel_path) for pattern in gitignore_patterns)


def strip_comments(content):
    """Remove single-line and multi-line comments from the file content."""
    content = re.sub(r'//.*', '', content)  # Remove single-line comments (//)
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)  # Multi-line comments (/* */)
    content = re.sub(r'///.*', '', content)  # Remove doc comments (///)
    content = re.sub(r'#.*', '', content)  # Remove Python/Shell/Yaml comments (#)
    content = re.sub(r'\n\s*\n', '\n', content)  # Remove empty lines
    return content


def find_files_in_dir(directory):
    """Recursively find all files in the given directory."""
    file_list = []
    for dirpath, dirnames, filenames in os.walk(directory):
        dirnames[:] = [d for d in dirnames if not is_ignored(os.path.join(dirpath, d))]
        for filename in filenames:
            if any(filename.endswith(ext) for ext in FILE_TYPES):
                file_path = os.path.join(dirpath, filename)
                if not is_ignored(file_path):
                    file_list.append(file_path)
    return file_list


def find_files_and_dirs(search_items, root_dir):
    """Search for files and directories matching the search_items in the root directory."""
    found_items = {}

    for search_item in search_items:
        search_path = os.path.join(root_dir, search_item)
        if os.path.isfile(search_path):  # If it's a file
            found_items[search_item] = 'file'
        elif os.path.isdir(search_path):  # If it's a directory
            found_items[search_item] = 'directory'
        else:
            # Search for matching filenames within subdirectories
            for dirpath, dirnames, filenames in os.walk(root_dir):
                dirnames[:] = [d for d in dirnames if not is_ignored(os.path.join(dirpath, d))]
                found_files = [os.path.join(dirpath, file) for file in filenames if file == search_item]
                for f in found_files:
                    relative_path = os.path.relpath(f, root_dir)
                    found_items[relative_path] = 'file'

    return found_items


def get_content(path, strip_comments_option):
    """Read the file content and optionally strip comments."""
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as file:
            content = file.read()
            if strip_comments_option:
                content = strip_comments(content)
            return content
    except Exception as e:
        return f"Error reading file: {str(e)}"


def get_git_file_content(file_path, revision='HEAD'):
    """Get file content from git at specific revision."""
    try:
        if revision == 'WORKING':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
        else:
            result = subprocess.run(
                ['git', 'show', f'{revision}:{file_path}'],
                capture_output=True,
                text=True,
                check=True
            )
            return result.stdout
    except (subprocess.CalledProcessError, FileNotFoundError, IOError):
        return None


def extract_function_changes(original_code, modified_code, file_path):
    """Extract and compare functions/methods that have changed."""
    try:
        # Parse both versions of the code
        original_ast = ast.parse(original_code)
        modified_ast = ast.parse(modified_code)

        def get_definitions(tree):
            definitions = {}
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    start_line = node.lineno
                    end_line = node.end_lineno
                    definitions[node.name] = {
                        'type': node.__class__.__name__,
                        'content': '\n'.join(original_code.split('\n')[start_line - 1:end_line]),
                        'lineno': start_line
                    }
            return definitions

        original_defs = get_definitions(original_ast)
        modified_defs = get_definitions(modified_ast)

        changes = {
            'modified_functions': [],
            'added_functions': [],
            'removed_functions': [],
            'file_path': file_path
        }

        # Find modified and removed functions
        for func_name, orig_func in original_defs.items():
            if func_name in modified_defs:
                if orig_func['content'] != modified_defs[func_name]['content']:
                    changes['modified_functions'].append({
                        'name': func_name,
                        'type': orig_func['type'],
                        'original': orig_func['content'],
                        'modified': modified_defs[func_name]['content']
                    })
            else:
                changes['removed_functions'].append({
                    'name': func_name,
                    'type': orig_func['type'],
                    'content': orig_func['content']
                })

        # Find added functions
        for func_name, mod_func in modified_defs.items():
            if func_name not in original_defs:
                changes['added_functions'].append({
                    'name': func_name,
                    'type': mod_func['type'],
                    'content': mod_func['content']
                })

        return changes
    except SyntaxError:
        return None


def create_ai_friendly_diff(file_path, original_content, modified_content, file_status):
    """Create an AI-friendly diff summary with file status information."""
    if original_content is None or modified_content is None:
        return {
            "file_path": file_path,
            "error": "Could not access file content",
            "status": file_status
        }

    if file_path.endswith('.py'):
        func_changes = extract_function_changes(original_content, modified_content, file_path)
        if func_changes:
            func_changes['status'] = file_status
            return func_changes

    diff_lines = list(unified_diff(
        original_content.splitlines(),
        modified_content.splitlines(),
        lineterm=''
    ))

    changes = {
        "file_path": file_path,
        "status": file_status,
        "changes": []
    }

    current_chunk = []
    for line in diff_lines:
        if line.startswith('@@'):
            if current_chunk:
                changes["changes"].append('\n'.join(current_chunk))
                current_chunk = []
        if not line.startswith('---') and not line.startswith('+++'):
            current_chunk.append(line)

    if current_chunk:
        changes["changes"].append('\n'.join(current_chunk))

    return changes


def get_file_status(file_path):
    """Get the status of a file (staged, unstaged, or untracked)."""
    try:
        staged = subprocess.run(
            ['git', 'diff', '--name-only', '--cached', file_path],
            capture_output=True,
            text=True,
            check=True
        ).stdout.strip()

        unstaged = subprocess.run(
            ['git', 'diff', '--name-only', file_path],
            capture_output=True,
            text=True,
            check=True
        ).stdout.strip()

        untracked = subprocess.run(
            ['git', 'ls-files', '--others', '--exclude-standard', file_path],
            capture_output=True,
            text=True,
            check=True
        ).stdout.strip()

        statuses = []
        if staged:
            statuses.append('staged')
        if unstaged:
            statuses.append('unstaged')
        if untracked:
            statuses.append('untracked')

        return ', '.join(statuses) if statuses else 'unchanged'
    except subprocess.CalledProcessError:
        return 'unknown'


def get_all_changed_files_since_last_commit():
    """Get all files that have changed since the last commit (staged and unstaged)."""
    try:
        last_commit = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            capture_output=True,
            text=True,
            check=True
        ).stdout.strip()

        changed_files = set()

        staged = subprocess.run(
            ['git', 'diff', '--name-only', '--cached'],
            capture_output=True,
            text=True,
            check=True
        ).stdout.splitlines()
        changed_files.update(staged)

        unstaged = subprocess.run(
            ['git', 'diff', '--name-only'],
            capture_output=True,
            text=True,
            check=True
        ).stdout.splitlines()
        changed_files.update(unstaged)

        untracked = subprocess.run(
            ['git', 'ls-files', '--others', '--exclude-standard'],
            capture_output=True,
            text=True,
            check=True
        ).stdout.splitlines()
        changed_files.update(untracked)

        # Filter out ignored files
        changed_files = {f for f in changed_files
                         if not is_ignored(f) and
                         any(f.endswith(ext) for ext in FILE_TYPES)}

        return list(changed_files), last_commit
    except subprocess.CalledProcessError as e:
        print(f"Error accessing git repository: {str(e)}")
        return [], None


def get_git_modified_files_with_diff():
    """Get comprehensive diff of all changes since last commit."""
    changed_files, last_commit = get_all_changed_files_since_last_commit()
    if not last_commit:
        return []

    diffs = []
    for file_path in changed_files:
        if not any(file_path.endswith(ext) for ext in FILE_TYPES) or is_output_file(file_path):
            continue

        status = get_file_status(file_path)
        original_content = get_git_file_content(file_path, last_commit)
        modified_content = get_git_file_content(file_path, 'WORKING')

        diff_info = create_ai_friendly_diff(file_path, original_content, modified_content, status)
        if diff_info:
            diff_info['commit_context'] = {
                'last_commit': last_commit[:8],
                'status': status
            }
            diffs.append(diff_info)

    return diffs


def get_codebase_structure(root_dir):
    """Generate complete codebase file structure, respecting gitignore."""
    structure = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Remove ignored directories
        dirnames[:] = [d for d in dirnames if not is_ignored(os.path.join(dirpath, d))]

        # Process files
        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            if not is_ignored(file_path) and any(filename.endswith(ext) for ext in FILE_TYPES):
                relative_path = os.path.relpath(file_path, root_dir)
                structure.append(relative_path)

    return sorted(structure)


def update_codebase_structures(root_dir, processed_files=None):
    """Update both codebase structure files."""
    # Update complete codebase structure
    complete_structure = get_codebase_structure(root_dir)
    save_structure_file(complete_structure, "codebase-file-structure.json")

    # Update structure for processed files if provided
    if processed_files:
        save_structure_file(processed_files, "processed-files-structure.json")


def create_tree_structure(files):
    """Convert file list into a nested tree structure for maximum token efficiency."""
    tree = {}

    for file_path in files:
        parts = file_path.replace('\\', '/').split('/')
        current = tree

        for part in parts[:-1]:  # Process directories
            if part not in current:
                current[part] = {}
            current = current[part]

        # Add file
        if '_files' not in current:
            current['_files'] = []
        current['_files'].append(parts[-1])

    def compress_tree(node):
        """Compress single-child directories into path segments."""
        if isinstance(node, dict):
            # Process non-file entries
            keys = [k for k in node.keys() if k != '_files']

            # Compress single-child paths
            while len(keys) == 1 and '_files' not in node:
                key = keys[0]
                child = node[key]
                if isinstance(child, dict):
                    node = {f"{key}/{next(iter(child.keys()))}": next(iter(child.values()))}
                    keys = [k for k in node.keys() if k != '_files']
                else:
                    break

            # Recursively process children
            return {k: compress_tree(v) if k != '_files' else sorted(v)
                    for k, v in node.items()}
        return node

    return compress_tree(tree)


def save_structure_file(structure, filename):
    """Save file structure to a JSON file using tree structure."""
    tree = create_tree_structure(structure)

    file_path = os.path.join(EXTRACT_DIR, filename)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump({
            "updated_at": datetime.now().isoformat(),
            "tree": tree
        }, f, indent=2)


def main():
    parser = argparse.ArgumentParser(
        description="File and directory content extractor with cleanup and AI-optimized diff.")

    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--git-modified", action="store_true", help="Process modified files from git status")
    mode_group.add_argument("filepaths", nargs='*', default=[],
                            help="Space-delimited file or directory paths to process")

    parser.add_argument("--diff-for-ai", action="store_true", help="Generate AI-friendly diffs of modified files")
    parser.add_argument("--strip-comments", action="store_true", help="Strip comments from file contents.")

    args = parser.parse_args()

    # Ensure z_extracts directory exists
    ensure_extract_directory()

    # Log the command
    log_command()

    root_dir = os.getcwd()

    # Handle AI-friendly diff generation for git-modified files
    if args.git_modified and args.diff_for_ai:
        cleanup_old_files("ai_diff")
        diffs = get_git_modified_files_with_diff()

        if diffs:
            # Get structure of modified files
            processed_files = [diff["file_path"] for diff in diffs]
            update_codebase_structures(root_dir, processed_files)

            output_file = os.path.join(EXTRACT_DIR, f"ai_diff_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
            with open(output_file, 'w', encoding='utf-8') as outfile:
                json.dump({
                    "type": "ai_optimized_diff",
                    "diffs": diffs
                }, outfile, indent=2)

            print(f"AI-optimized diff saved to {output_file}")
        else:
            print("No modified files found")
            # Still update complete codebase structure
            update_codebase_structures(root_dir)
        return

    # Handle regular content extraction
    cleanup_old_files("extracted_content")
    result = {"files": {}}
    processed_files = []

    if args.git_modified:
        modified_files = get_git_modified_files_with_diff()
        if not modified_files:
            print("No modified files found in git status")
            update_codebase_structures(root_dir)
            return

        for file_path in modified_files:
            if not is_ignored(file_path):
                processed_files.append(file_path)
                if os.path.exists(file_path) and os.path.getsize(file_path) <= MAX_FILE_SIZE:
                    result['files'][file_path] = get_content(file_path, args.strip_comments)
                else:
                    result['files'][file_path] = "File too large to process or doesn't exist."

    elif args.filepaths:
        found_items = find_files_and_dirs(args.filepaths, root_dir)

        for item, item_type in found_items.items():
            if item_type == 'file':
                processed_files.append(item)
                file_path = os.path.join(root_dir, item)
                if os.path.getsize(file_path) <= MAX_FILE_SIZE:
                    result['files'][item] = get_content(file_path, args.strip_comments)
                else:
                    result['files'][item] = "File too large to process."
            elif item_type == 'directory':
                full_dir_path = os.path.join(root_dir, item)
                all_files_in_dir = find_files_in_dir(full_dir_path)
                for file_in_dir in all_files_in_dir:
                    relative_file_path = os.path.relpath(file_in_dir, root_dir)
                    processed_files.append(relative_file_path)
                    if os.path.getsize(file_in_dir) <= MAX_FILE_SIZE:
                        result['files'][relative_file_path] = get_content(file_in_dir, args.strip_comments)
                    else:
                        result['files'][relative_file_path] = "File too large to process."
    else:
        parser.print_help()
        # Still update complete codebase structure
        update_codebase_structures(root_dir)
        return

    # Update both structure files
    update_codebase_structures(root_dir, processed_files)

    # Save the main output
    output_file = os.path.join(EXTRACT_DIR, f"extracted_content_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(output_file, 'w', encoding='utf-8') as outfile:
        json.dump(result, outfile, indent=2)

    print(f"Output saved to {output_file}")
    print(f"File structures updated in {EXTRACT_DIR}")
    print(f"Command history logged to {os.path.join(EXTRACT_DIR, COMMAND_LOG)}")


if __name__ == "__main__":
    main()
