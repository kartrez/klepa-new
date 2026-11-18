import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

export const cliInvitationAction = "Попробовать такую задачу в терминале"
// The browser that authorized the extension already knows the account on gpt-chat.by.
export const cliInvitationUrl =
  "https://gpt-chat.by/auth/site/?target=https%3A%2F%2Fklepa.gpt-chat.by&next=%2Fklepa-cli-primer%2F"

export function createCliInvitation(
  storage: string,
  ask: () => PromiseLike<string | undefined>,
  open: () => PromiseLike<boolean>,
) {
  let claimed = false
  return async () => {
    if (claimed) return
    claimed = true
    try {
      await mkdir(storage, { recursive: true })
      await writeFile(join(storage, "cli-invitation-shown"), "", { flag: "wx" })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return
      claimed = false
      console.warn("[Klepa] Не удалось сохранить показ предложения CLI", error)
      return
    }
    if ((await ask()) === cliInvitationAction) await open()
  }
}
