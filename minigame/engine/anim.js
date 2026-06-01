// Animation helpers for TheTime mini game

// Linear interpolation
function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

// Ease out cubic
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// Ease in out cubic
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Clamp value
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// Fade animation state
class FadeAnim {
  constructor(delay = 0, duration = 600) {
    this.startTime = -1
    this.delay = delay
    this.duration = duration
    this.done = false
  }

  start(now) {
    this.startTime = now
  }

  update(now) {
    if (this.startTime < 0) return 0
    const elapsed = now - this.startTime - this.delay
    if (elapsed <= 0) return 0
    if (elapsed >= this.duration) {
      this.done = true
      return 1
    }
    return easeOutCubic(elapsed / this.duration)
  }

  get opacity() {
    return this.update(Date.now())
  }
}

// Slide + fade animation
class SlideFadeAnim {
  constructor(startY = 20, delay = 0, duration = 600) {
    this.startY = startY
    this.delay = delay
    this.duration = duration
    this.startTime = -1
  }

  start(now) {
    this.startTime = now
  }

  update(now) {
    if (this.startTime < 0) return { opacity: 0, y: 0 }
    const elapsed = now - this.startTime - this.delay
    if (elapsed <= 0) return { opacity: 0, y: this.startY }
    const t = Math.min(elapsed / this.duration, 1)
    const eased = easeOutCubic(t)
    return {
      opacity: eased,
      y: this.startY * (1 - eased)
    }
  }
}

// Character-by-character animation for title text
class CharAnim {
  constructor(text, charDelay = 150, fadeDuration = 600) {
    this.text = text
    this.charDelay = charDelay
    this.fadeDuration = fadeDuration
    this.startTime = -1
  }

  start(now) {
    this.startTime = now
  }

  getCharOpacity(now, index) {
    if (this.startTime < 0) return 0
    const elapsed = now - this.startTime - index * this.charDelay
    if (elapsed <= 0) return 0
    if (elapsed >= this.fadeDuration) return 1
    return easeOutCubic(elapsed / this.fadeDuration)
  }
}

// Timeline - manage multiple timed animations
class Timeline {
  constructor() {
    this.animations = []
    this.startTime = -1
  }

  start(now) {
    this.startTime = now
    this.animations.forEach(a => a.start && a.start(now))
  }

  get progress() {
    if (this.startTime < 0) return 0
    return Date.now() - this.startTime
  }
}

module.exports = {
  lerp, easeOutCubic, easeInOutCubic, clamp,
  FadeAnim, SlideFadeAnim, CharAnim, Timeline,
}
