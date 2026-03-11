# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Authora is a NestJS 11 application using TypeScript, built with the standard NestJS module/controller/service architecture.

## Commands

- `npm run build` — Build the project
- `npm run start:dev` — Start dev server with watch mode (port 3000 by default, or `PORT` env var)
- `npm run lint` — Lint and auto-fix with ESLint (flat config) + Prettier
- `npm run format` — Format code with Prettier
- `npm test` — Run unit tests (Jest, files matching `*.spec.ts` in `src/`)
- `npm test -- --testPathPattern=<pattern>` — Run a single test file
- `npm run test:e2e` — Run e2e tests (files matching `*.e2e-spec.ts` in `test/`)

## Code Style

- TypeScript with `nodenext` module resolution, target ES2023
- Prettier: single quotes, no trailing commas
- ESLint: `@typescript-eslint/no-explicit-any` is off; floating promises and unsafe arguments are warnings
