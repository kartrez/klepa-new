import { createContext, useContext, ParentComponent, Accessor } from "solid-js"
import type { KilocodeNotification } from "../types/messages"

interface NotificationsContextValue {
  notifications: Accessor<KilocodeNotification[]>
  filteredNotifications: Accessor<KilocodeNotification[]>
  dismiss: (id: string) => void
}

export const NotificationsContext = createContext<NotificationsContextValue>()

const empty = (): KilocodeNotification[] => []

export const NotificationsProvider: ParentComponent = (props) => {
  const value: NotificationsContextValue = {
    notifications: empty,
    filteredNotifications: empty,
    dismiss: () => {},
  }

  return <NotificationsContext.Provider value={value}>{props.children}</NotificationsContext.Provider>
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext)
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationsProvider")
  }
  return context
}
