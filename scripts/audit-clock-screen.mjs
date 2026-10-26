/*
 * THE CLOCK AUDIT'S SCREEN HALF, as its own entry point for the gate's
 * run_audit, which runs a script with no arguments. See audit-clock.mjs.
 */
process.argv.push('--screen')
await import('./audit-clock.mjs')
