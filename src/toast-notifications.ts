const TOASTS = [
  '@everyone just checking in on the timeline',
  'meeting starts in -14 minutes',
  '"quick question" from management',
  'task NAG-4091 reassigned to you',
  'the shared doc was overwritten (not your fault) (maybe)',
  'your request has been pending for 9 days',
  'progress report is uh... let\'s talk',
  'new thread in #urgent you were tagged in',
  'someone edited the doc while you were reading it',
  'reminder: update your status in 15 different places',
  'review overdue by 3 weeks',
  '"per my last message"',
  'change freeze starts... now',
  'the shared folder is down again',
  'someone muted you in the meeting',
  'recurring meeting: "sync about the sync"',
  'deadline is tomorrow. scope unchanged.',
  'someone reorganized the shared drive while you slept',
  'new person in the group chat asking "is this the right channel?"',
  'the same form has been resubmitted for the 4th time',
  'complaints up 300%. related? unrelated? yes.',
  'your request has been in "backlog" for 194 days',
  '"can we get an update on the update?"',
  'your session expired. again.',
  'all-hands moved to 4:55 PM Friday',
]

const MAX_VISIBLE = 4

export class ToastNotifications {
  private container: HTMLElement
  private toasts: HTMLElement[] = []
  private nextToast: number

  constructor() {
    this.container = document.createElement('div')
    this.container.className = 'toast-container'
    document.body.appendChild(this.container)
    this.nextToast = performance.now() + 5000 + Math.random() * 8000
  }

  update(now: number): void {
    if (now < this.nextToast) return
    this.nextToast = now + 6000 + Math.random() * 12000
    this.show(TOASTS[Math.floor(Math.random() * TOASTS.length)])
  }

  /** Push a custom toast immediately — Ship It milestones etc. */
  push(msg: string): void {
    this.show(msg)
  }

  private show(msg: string): void {
    const el = document.createElement('div')
    el.className = 'toast-notification'
    el.textContent = msg

    // Remove oldest if too many
    if (this.toasts.length >= MAX_VISIBLE) {
      const old = this.toasts.shift()!
      old.style.opacity = '0'
      old.style.transform = 'translateX(120%)'
      setTimeout(() => old.remove(), 400)
    }

    this.container.appendChild(el)
    this.toasts.push(el)

    // Trigger enter animation
    requestAnimationFrame(() => {
      el.style.opacity = '1'
      el.style.transform = 'translateX(0)'
    })

    // Auto-dismiss after 5-8 seconds
    const dismissTime = 5000 + Math.random() * 3000
    setTimeout(() => {
      el.style.opacity = '0'
      el.style.transform = 'translateX(120%)'
      setTimeout(() => {
        el.remove()
        const idx = this.toasts.indexOf(el)
        if (idx !== -1) this.toasts.splice(idx, 1)
      }, 400)
    }, dismissTime)
  }
}

