/**
 * strings.ts — Centralized UI strings for localization
 *
 * All user-facing strings should be imported from here.
 * Currently English only — structured for future locale support.
 * Add new locales by creating a parallel object (e.g., stringsES)
 * and switching based on device locale.
 */

const strings = {
  // Common actions
  cancel: "Cancel",
  save: "Save",
  delete: "Delete",
  add: "Add",
  edit: "Edit",
  close: "Close",
  retry: "Retry",
  ok: "OK",
  done: "Done",
  goBack: "Go Back",
  confirm: "Confirm",

  // Dashboard
  dashboard: {
    syncData: "Sync data",
    syncing: "Syncing",
    changeLayout: "Change layout",
    openSettings: "Open settings",
    lockHub: "Lock hub",
    hubIsLocked: "Hub is locked",
    enterPin: "Enter PIN to unlock",
    setPin: "Set a PIN",
    choosePinHint: "Choose a 4-digit PIN to lock the hub",
    timesUp: "Time's up!",
  },

  // Widgets
  widgets: {
    timer: "Timer",
    clock: "Clock",
    calendar: "Calendar",
    todoList: "To-Do List",
    dailyTasks: "Daily Tasks",
    weeklyTasks: "Weekly Tasks",
    calendarList: "Calendar List",
    cleaning: "Cleaning",
    monthCalendar: "Month Calendar",
    setTimer: "Set Timer",
    play: "Play",
    pause: "Pause",
    reset: "Reset",
    noListSelected: "No list selected",
    createListFirst: "Create a list first",
    allDone: "All done!",
    noEvents: "No events",
    markCleaned: "Mark as cleaned",
    overdue: "Overdue",
    dueToday: "Due today",
    timesUp: "Time's up!",
    min: "min",
    sec: "sec",
  },

  // Settings
  settings: {
    title: "Settings",
    hubName: "Hub Name",
    familyMembers: "Family Members",
    noMembersYet: 'No family members yet. Tap "Add" above.',
    calendars: "Calendars",
    noCalendarsYet: 'No calendars connected. Tap "Add" above.',
    notifications: "Notifications",
    doNotDisturb: "Do Not Disturb",
    alwaysOnDisplay: "Always-On Display",
    showClock: "Show Clock Bar",
    syncToGoogle: "Sync to Google",
    batteryAlert: "Battery Alert",
    screenBrightness: "Screen Brightness",
    theme: "Theme",
    lockScreen: "Lock Screen",
    showContentWhenLocked: "Show Content When Locked",
    muteAlarmsWhenLocked: "Mute Alarms When Locked",
    changePin: "Change PIN",
    removePin: "Remove PIN",
    weather: "Weather",
    alarmSchedule: "Alarm Schedule",
    cleaningTracker: "Cleaning Tracker",
    appManager: "App Manager",
    dangerZone: "Danger Zone",
    resetAllData: "Reset All Data",
    exportData: "Export Data",
  },

  // Calendar
  calendar: {
    today: "Today",
    tomorrow: "Tomorrow",
    allDay: "All Day",
    addEvent: "Add Event",
    deleteEvent: "Delete Event",
    noTitle: "(No title)",
    subscriptions: "Calendar Subscriptions",
    addCalendar: "Add Calendar",
  },

  // Lists
  lists: {
    allLists: "All Lists",
    addList: "Add List",
    deleteList: "Delete List",
    addItem: "Add item...",
    pending: "pending",
    done: "done",
  },

  // Alarms
  alarms: {
    title: "Alarm Schedule",
    addAlarm: "Add Alarm",
    deleteAlarm: "Delete Alarm",
    label: "Label",
    message: "Message",
    sound: "Sound",
    interval: "Every X Hours",
    specificTime: "Specific Time",
    randomWindow: "Random Window",
    once: "Once",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
  },

  // Quick add
  quickAdd: {
    placeholder: "Add to list...",
    addButton: "Add",
  },

  // Weather
  weather: {
    loading: "Loading weather...",
    locationError: "Location unavailable",
  },

  // Sync
  sync: {
    syncComplete: "Sync complete",
    syncFailed: "Sync failed",
    reAuthRequired: "Re-authentication needed",
  },

  // Errors
  errors: {
    somethingWentWrong: "Something went wrong",
    widgetError: "Widget error",
    networkError: "Network error",
    permissionDenied: "Permission denied",
  },

  // Members
  members: {
    addMember: "Add Family Member",
    editMember: "Edit Member",
    removeMember: "Remove Member",
    confirmRemove: "Remove this member from the family?",
    name: "Name",
    role: "Role",
    adult: "Adult",
    child: "Child",
    admin: "Admin",
    color: "Color",
    pinSet: "PIN set",
    noPin: "No PIN",
  },

  // PIN
  pin: {
    enterCurrent: "Enter Current PIN",
    enterNew: "Enter New PIN",
    enterPin: "Enter PIN",
    verifyCurrent: "Verify your current PIN to continue",
    chooseNew: "Choose a new 4-digit PIN",
    requiredToExport: "PIN required to export",
    pinChanged: "Your hub PIN has been updated.",
    wrongPin: "Incorrect PIN.",
    wrongCurrentPin: "Incorrect current PIN.",
    tooManyAttempts: "Too Many Attempts",
    tryAgainIn: (secs: number) => `Try again in ${secs} seconds.`,
    noPinSet: "No PIN Set",
    useLockButton: "Use the lock button on the dashboard to set a PIN first.",
    backspace: "Backspace",
    cancelEntry: "Cancel PIN entry",
    invalid: "PIN must be 4 digits.",
  },

  // Data management
  data: {
    resetTitle: "Reset All Data",
    resetConfirm: "This will erase all family members, calendars, events, and lists. This cannot be undone.",
    exportCleaningLog: "Export Cleaning Log",
    noDataToExport: "No data to export.",
  },

  // Cleaning
  cleaning: {
    title: "Cleaning",
    addItem: "Add cleaning item",
    removeItem: "Remove Item",
    confirmRemove: (name: string) => `Remove "${name}" from cleaning tracker?`,
    remove: "Remove",
    markCleaned: "Mark as cleaned",
    cleanAgain: "Clean Again",
    resetToUnclean: "Reset to Unclean",
    noLog: "No cleaning history to export.",
    who: "Who cleaned?",
    notes: "Notes (optional)",
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "2 weeks",
    monthly: "Monthly",
    history: "History",
    exportLog: "Export Log",
  },

  // App manager
  appManager: {
    title: "App Manager",
    description: "Find and uninstall apps from this device",
    search: "Search apps...",
    noApps: "No apps found",
    uninstall: "Uninstall",
  },

  // Greetings (for ClockWidget)
  greetings: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  },

  // Accessibility
  a11y: {
    pinDigit: (digit: string) => `PIN digit ${digit}`,
    deleteLastDigit: "Delete last digit",
    closePanel: "Close panel",
    configureWidget: "Configure widget",
    toggleItem: (text: string) => `Toggle ${text}`,
  },
} as const;

export default strings;
