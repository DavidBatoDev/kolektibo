import { useEffect } from 'react'

/** Scroll reveals, proof playground, nav chrome — ported from landing/index.html scripts. */
export function useLandingPageEffects() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.landing-page .nav')
    if (!nav) return

    const onScroll = () => {
      nav.classList.toggle('scrolled', window.scrollY > 40)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    let lastScrollY = window.scrollY
    const hero = document.querySelector<HTMLElement>('.landing-page .hero-card')
    const safe = document.querySelector<HTMLElement>('.landing-page .safe')

    const onScrollAdvanced = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        nav.classList.add('nav-hidden')
      } else {
        nav.classList.remove('nav-hidden')
      }
      lastScrollY = currentScrollY

      if (window.innerWidth > 900) {
        if (currentScrollY < window.innerHeight && hero) {
          hero.style.backgroundPosition =
            `center, center, center, center, 76% calc(50% + ${currentScrollY * 0.4}px)`
        }
        if (safe) {
          const safeTop = safe.getBoundingClientRect().top
          if (safeTop < window.innerHeight && safeTop > -safe.offsetHeight) {
            safe.style.backgroundPosition = `center, 82% calc(50% + ${safeTop * -0.3}px)`
          }
        }
      }
    }
    window.addEventListener('scroll', onScrollAdvanced, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScrollAdvanced)
    }
  }, [])

  useEffect(() => {
    const panels = document.querySelectorAll<HTMLElement>('.landing-page .pg-panel')

    function setStep(panel: HTMLElement, label: string, isFail: boolean) {
      const live = panel.querySelector<HTMLElement>('.st-live')
      const txt = panel.querySelector<HTMLElement>('.st-txt')
      if (txt) txt.textContent = label
      live?.classList.toggle('fail', isFail)
    }

    function run(panel: HTMLElement) {
      if (panel.dataset.running === '1') return
      panel.dataset.running = '1'
      const type = panel.dataset.type
      const brk = parseInt(panel.dataset.break ?? '99', 10)
      const nodes = [...panel.querySelectorAll<HTMLElement>('.node')]
      panel.classList.remove('done', 'ok', 'bad')
      panel.classList.add('running')
      nodes.forEach((n) => n.classList.remove('on', 'fail'))
      setStep(panel, '', false)
      const stop = type === 'attack' ? brk : nodes.length
      let i = 0

      const finish = () => {
        panel.classList.remove('running')
        panel.classList.add('done', type === 'valid' ? 'ok' : 'bad')
        panel.dataset.running = ''
      }

      const tick = () => {
        if (i >= stop) return finish()
        const n = nodes[i]
        const label = n.getAttribute('data-label') ?? ''
        if (type === 'attack' && i === brk - 1) {
          n.classList.add('fail')
          setStep(panel, label, true)
          setTimeout(finish, 1200)
          return
        }
        n.classList.add('on')
        setStep(panel, label, false)
        i++
        setTimeout(tick, 600)
      }
      setTimeout(tick, 300)
    }

    const onRun = (e: Event) => {
      const btn = e.currentTarget as HTMLButtonElement
      const panel = btn.closest<HTMLElement>('.pg-panel')
      if (panel) run(panel)
    }

    document.querySelectorAll<HTMLButtonElement>('.landing-page .pg-run').forEach((btn) => {
      btn.addEventListener('click', onRun)
    })

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('active')
          const panel = entry.target as HTMLElement
          if (panel.classList.contains('pg-panel') && !panel.dataset.auto) {
            panel.dataset.auto = '1'
            setTimeout(() => {
              panel.querySelector<HTMLButtonElement>('.pg-run')?.click()
            }, 600)
          }
          revealObserver.unobserve(entry.target)
        })
      },
      { threshold: 0.1 },
    )

    document.querySelectorAll('.landing-page .reveal-up').forEach((el) => revealObserver.observe(el))

    const onGlowMove = (e: Event) => {
      const card = e.currentTarget as HTMLElement
      const rect = card.getBoundingClientRect()
      card.style.setProperty('--mouse-x', `${(e as MouseEvent).clientX - rect.left}px`)
      card.style.setProperty('--mouse-y', `${(e as MouseEvent).clientY - rect.top}px`)
    }

    document.querySelectorAll<HTMLElement>('.landing-page .glow-card').forEach((card) => {
      card.addEventListener('mousemove', onGlowMove)
    })

    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const el = entry.target as HTMLElement
          if (el.dataset.counted) return
          el.dataset.counted = 'true'
          const target = parseInt(el.getAttribute('data-target') ?? '0', 10)
          const duration = 3000
          let start: number | null = null

          const step = (timestamp: number) => {
            if (!start) start = timestamp
            const progress = Math.min((timestamp - start) / duration, 1)
            const ease = progress === 1 ? 1 : 1 - 2 ** (-10 * progress)
            el.textContent = `₱${Math.floor(ease * target).toLocaleString('en-US')}`
            if (progress < 1) requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        })
      },
    )

    document.querySelectorAll('.landing-page .counter').forEach((el) => counterObserver.observe(el))

    return () => {
      document.querySelectorAll<HTMLButtonElement>('.landing-page .pg-run').forEach((btn) => {
        btn.removeEventListener('click', onRun)
      })
      document.querySelectorAll<HTMLElement>('.landing-page .glow-card').forEach((card) => {
        card.removeEventListener('mousemove', onGlowMove)
      })
      revealObserver.disconnect()
      counterObserver.disconnect()
    }
  }, [])
}
