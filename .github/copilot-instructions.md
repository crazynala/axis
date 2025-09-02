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

- [ ] contacts -> app/routes/contacts.tsx (loader/action wiring)
- [ ] companies -> app/routes/companies.tsx
- [ ] products -> app/routes/products.tsx
- [ ] costings -> app/routes/costings.tsx
- [ ] jobs -> app/routes/jobs.tsx
- [ ] assembly -> app/routes/assembly.tsx
- [ ] assembly-activities -> app/routes/assembly-activities.tsx
- [ ] admin -> app/routes/admin.tsx
