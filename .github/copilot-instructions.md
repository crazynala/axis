<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

- [x] Clarify Project Requirements: Migrating ERP React/Vite/Express/Prisma/Postgres codebase to Remix + React 18.
- [x] Scaffold the Project
- [x] Customize the Project
- [x] Install Required Extensions
- [x] Compile the Project
- [x] Create and Run Task
- [x] Launch the Project
- [x] Ensure Documentation is Complete

## Migration Plan

- Scaffold Remix app with React 18
- Integrate Prisma/Postgres
- Move ERP modules (Products, Admin, etc.) to Remix routes
- Adapt Excel import and backend logic to Remix loaders/actions
- Update README and copilot-instructions.md

### Active Migration Map

- [x] contacts -> app/routes/contacts.tsx (loader/action wiring)
- [x] companies -> app/routes/companies.tsx
- [x] products -> app/routes/products.tsx
- [x] costings -> app/routes/costings.tsx
- [x] jobs -> app/routes/jobs.tsx
- [x] assembly -> app/routes/assembly.tsx
- [x] assembly-activities -> app/routes/assembly-activities.tsx
- [x] admin -> app/routes/admin.tsx
