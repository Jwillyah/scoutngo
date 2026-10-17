import { createContext, use } from 'react'
import { NUMERALS_DEFAULT } from '../core/numerals.ts'

/*
 * The context object and its hook, kept apart from the components that use
 * them so src/lib/numerals.tsx exports components only and fast refresh keeps
 * working on it. See src/core/numerals.ts for what the switch means.
 *
 * THE DEFAULT IS FALSE DELIBERATELY. A component rendered outside the provider
 * — which in practice means inside a test — is quiet. Were the default "show",
 * a test could pass while the switch did nothing.
 */
export const NumeralsContext = createContext<boolean>(NUMERALS_DEFAULT)

/** Whether the receipts are currently shown. */
export function useNumerals(): boolean {
  return use(NumeralsContext)
}
