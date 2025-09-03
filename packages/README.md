This folder hosts vendored workspace packages.

To add timber here:

- git submodule add https://github.com/crazynala/timber packages/timber
  - or: git clone https://github.com/crazynala/timber packages/timber && rm -rf packages/timber/.git
- Ensure app's package.json depends on "@aa/timber": "workspace:\*"
- From repo root, run: npm install
- To update submodule: git submodule update --remote --merge packages/timber
