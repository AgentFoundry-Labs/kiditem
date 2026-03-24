import os
import glob
import re

files = glob.glob("src/**/*.tsx", recursive=True)

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()
        
    original = content
    
    # fix button text colors that were blindly changed
    content = re.sub(r'bg-blue-500.*text-gray-900', lambda m: m.group(0).replace('text-gray-900', 'text-white'), content)
    content = re.sub(r'bg-blue-600.*text-gray-900', lambda m: m.group(0).replace('text-gray-900', 'text-white'), content)
    content = re.sub(r'bg-green-600.*text-gray-900', lambda m: m.group(0).replace('text-gray-900', 'text-white'), content)
    content = re.sub(r'bg-red-500.*text-gray-900', lambda m: m.group(0).replace('text-gray-900', 'text-white'), content)
    content = re.sub(r'bg-gray-900.*text-gray-900', lambda m: m.group(0).replace('text-gray-900', 'text-white'), content)
    content = re.sub(r'bg-slate-900.*text-gray-900', lambda m: m.group(0).replace('text-gray-900', 'text-white'), content)
    content = re.sub(r'from-blue-500 to-violet-600.*text-gray-900', lambda m: m.group(0).replace('text-gray-900', 'text-white'), content)

    if content != original:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Fixed buttons in {file_path}")

