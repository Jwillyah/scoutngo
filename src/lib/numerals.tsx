import { type ReactNode } from 'react'
import { isReceipt, type NumeralKind } from '../core/numerals.ts'
import { NumeralsContext, useNumerals } from './numeralsContext.ts'

/*
 * THE ONE SWITCH, AS CONTEXT.
 *
 * WHY CONTEXT AND NOT A PROP. This reaches the time bar, the ray plates on the
 * map, every position card, the field card, the sun readout and the venue
 * plate. Threading a boolean through those would be forty prop signatures
 * changed for one value that is the same everywhere and never differs by
 * subtree, which is the case context is actually for.
 *
 * THE DEFAULT IS FALSE AND THAT IS DELIBERATE. A component rendered outside
 * the provider, which in practice means inside a test, is quiet. If the
 * default were "show", a test could pass while the switch did nothing.
 */
export function NumeralsProvider({ show, children }: { show: boolean; children: ReactNode }) {
  return <NumeralsContext value={show}>{children}</NumeralsContext>
}

/**
 * A NUMBER THAT IS A RECEIPT, which disappears with the switch.
 *
 * Wrapping rather than a conditional at each site, so the rule is applied by
 * the same code everywhere and a site cannot accidentally use the wrong one:
 * the `kind` is the argument, and src/core/numerals.ts decides.
 *
 * Renders nothing at all rather than an empty element, so the gap it leaves
 * collapses and the line beside it does not keep a dangling separator.
 */
export function Receipt({ kind, children }: { kind: NumeralKind; children: ReactNode }) {
  const show = useNumerals()
  if (isReceipt(kind) && !show) return null
  return <>{children}</>
}
