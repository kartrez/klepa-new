import { describe, expect, it, mock } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliInvitationAction, cliInvitationUrl, createCliInvitation } from "../../src/services/cli-invitation"

describe("terminal invitation", () => {
  for (const selection of [cliInvitationAction, "Закрыть", undefined]) {
    it(`shows once across windows and restarts for ${String(selection)}`, async () => {
      const directory = await mkdtemp(join(tmpdir(), "klepa-invitation-"))
      try {
        const ask = mock(async () => selection)
        const open = mock(async () => true)
        const create = () => createCliInvitation(join(directory, "profile"), ask, open)
        const first = create()
        await Promise.all([first(), first(), create()()])
        await create()()
        expect(ask).toHaveBeenCalledTimes(1)
        expect(open).toHaveBeenCalledTimes(selection === cliInvitationAction ? 1 : 0)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    })
  }

  it("opens the browser session handoff with just the destination", () => {
    const url = new URL(cliInvitationUrl)
    expect(url.origin + url.pathname).toBe("https://gpt-chat.by/auth/site/")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      target: "https://klepa.gpt-chat.by",
      next: "/klepa-cli-primer/",
    })
  })
})
