# ADR-001: Keep ports/adapters for MVP testability

## Status
Accepted — March 24, 2026

## Context
Design spec v2 challenged architecture complexity and asked whether direct module imports would be enough.

## Decision
The project keeps ports/adapters at OCR and storage boundaries.

## Rationale
This is not for enterprise scaling. It is for deterministic tests around slow/non-deterministic components (OCR engines and persistence). The ongoing maintenance cost is one interface per boundary, which is acceptable for MVP.

## Consequences
- Unit tests can inject fakes without mocking global modules.
- A future Capacitor Vision adapter can be added without rewriting callers.
- Team should avoid introducing extra abstraction layers beyond boundary ports.
