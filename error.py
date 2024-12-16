#!/usr/bin/env python3
"""
Simple Error Extractor for PyCharm Projects

This script uses PyCharm's command-line tools to extract project errors based on configured inspections.
"""

import os
import subprocess
import sys
from datetime import datetime

# Path to your PyCharm executable or CLI
PYCHARM_PATH = "/path/to/pycharm"

# Inspection profile to use (can be customized)
INSPECTION_PROFILE = "Default"

# Output directory for inspection results
OUTPUT_DIR = "inspection_results"


def run_inspection(project_path):
    """Run PyCharm's inspection tool on the given project path."""
    try:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        output_file = os.path.join(OUTPUT_DIR, f"errors_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xml")

        command = [
            PYCHARM_PATH,
            "inspect",
            project_path,
            INSPECTION_PROFILE,
            output_file
        ]
        subprocess.run(command, check=True)
        print(f"Inspection completed. Results saved to {output_file}")
    except FileNotFoundError:
        print("PyCharm CLI tools not found. Please check the PYCHARM_PATH.")
    except subprocess.CalledProcessError as e:
        print(f"Error running inspection: {e}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python error.py <path_to_project>")
        sys.exit(1)

    project_path = sys.argv[1]
    if not os.path.exists(project_path):
        print(f"Project path does not exist: {project_path}")
        sys.exit(1)

    run_inspection(project_path)


if __name__ == "__main__":
    main()
