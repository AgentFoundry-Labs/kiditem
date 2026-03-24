import os
import glob
import re

files_to_check = [
    "src/shared/components/layout/Sidebar.tsx",
    "src/shared/components/layout/Header.tsx",
    "src/shared/components/layout/AppLayout.tsx",
    "src/app/page.tsx",
    "src/app/workflows/page.tsx",
    "src/app/modules/[moduleId]/page.tsx",
    "src/app/logs/page.tsx",
    "src/app/settings/page.tsx",
    "src/app/globals.css",
    "src/shared/components/ui/DataTable.tsx",
    "src/shared/components/ui/MetricCard.tsx",
    "src/shared/components/ui/StatusBadge.tsx"
]

domain_files = []
for domain in ["dashboard", "workflows", "modules"]:
    domain_files.extend(glob.glob(f"src/domains/{domain}/components/**/*.tsx", recursive=True))

all_files = files_to_check + domain_files

replacements = {
    r'bg-\[#0a0b0f\]': 'bg-gray-50',
    r'bg-\[#0d0e13\]': 'bg-white',
    r'bg-\[#12131a\]': 'bg-white',
    r'bg-\[#1a1d26\]': 'bg-white',
    r'bg-\[#161821\]': 'bg-white',
    r'bg-\[#111318\]': 'bg-white',
    
    r'hover:bg-\[#1a1d26\]': 'hover:bg-gray-100',
    r'hover:bg-white/5': 'hover:bg-gray-50',
    
    r'border-\[#1e2028\]': 'border-gray-200',
    r'border-\[#2a2d38\]': 'border-gray-200',
    r'border-white/10': 'border-gray-200',
    
    r'text-white': 'text-gray-900',
    r'text-gray-400': 'text-gray-500',
    r'text-gray-300': 'text-gray-700',
    
    r'bg-emerald-400/10': 'bg-green-50',
    r'bg-blue-400/10': 'bg-blue-50',
    r'text-emerald-400': 'text-green-600',
    r'text-blue-400': 'text-blue-600',
    r'bg-emerald-500/10': 'bg-green-50',
    r'bg-blue-500/10': 'bg-blue-50',
    
    r'scrollbar-thumb-\[#1e2028\]': 'scrollbar-thumb-gray-200',
    
    # glass-card specific
    r'bg-\[#0d0e13\]/80': 'bg-white/80',
    r'bg-\[#111318\]/80': 'bg-white/80',
    r'backdrop-blur-xl': 'backdrop-blur-xl shadow-sm',
}

for file_path in all_files:
    if not os.path.exists(file_path):
        continue
        
    with open(file_path, 'r') as f:
        content = f.read()
        
    original = content
    
    for old, new in replacements.items():
        content = re.sub(old, new, content)
        
    # Also handle standard glass cards and ring
    content = re.sub(r'ring-1 ring-white/5', 'ring-1 ring-gray-200', content)
    content = re.sub(r'ring-white/10', 'ring-gray-200', content)
    
    # Fix sidebar active state text-blue-400 -> text-blue-600 because of the previous replacement
    # Or just let it be text-blue-600 which is fine
    
    if content != original:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Updated {file_path}")

