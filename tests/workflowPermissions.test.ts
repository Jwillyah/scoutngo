import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * CLAUDE.md, Pushing (decided 9 Nov): the nightly model-skill workflow is the
 * one thing that pushes on its own, and only public/skill/. The repo's default
 * workflow token stays read-only, so write has to be asked for in the YAML;
 * this pins that no other workflow asks, and that this one stages nothing else.
 */
const DIR = '.github/workflows'
const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))

describe('workflow write permissions', () => {
  it('only model-skill.yml asks for contents: write', () => {
    const writers = files.filter((f) => /contents:\s*write/.test(readFileSync(`${DIR}/${f}`, 'utf8')))
    expect(writers).toEqual(['model-skill.yml'])
  })

  it('model-skill stages public/skill and nothing else, and never force-pushes', () => {
    const y = readFileSync(`${DIR}/model-skill.yml`, 'utf8')
    const adds = [...y.matchAll(/git add ([^\n]+)/g)].map((m) => m[1].trim())
    expect(adds).toEqual(['public/skill'])
    expect(y).not.toMatch(/git commit -a|git add -A|git add \.|--force|-f\b.*push/)
    expect(y).not.toMatch(/permissions:[\s\S]*?(actions|pull-requests|issues|packages|deployments):\s*write/)
  })
})
