"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

/**
 * The landing page's motion (GSAP), attached to elements by data attributes so the page itself stays a server
 * component: branches drawing themselves in the hero (`data-branch`), the hero screenshot flattening as it scrolls
 * into view (`data-hero-shot`) and leaning toward the pointer (`data-tilt`), buttons drawn to the pointer
 * (`data-magnetic`), and blocks rising in as they come into view (`data-reveal`, `data-stagger` for a group's
 * children). Nothing moves for people who prefer reduced motion; without JavaScript everything simply shows.
 */
export function LandingMotion() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    const cleanups: (() => void)[] = [];

    media.add("(prefers-reduced-motion: no-preference)", () => {
      // The hero tree grows level by level: wires start hidden in CSS (.landing-branch, pathLength 1) and draw from the
      // parent's dot; each dot grows (its radius, never a transform, so it cannot drift off the line ends) when the
      // wire into it arrives, and leaf halos pulse by radius too.
      const LEVEL = 0.45;
      for (const wire of gsap.utils.toArray<SVGPathElement>("[data-branch]")) {
        const depth = Number(wire.dataset.depth ?? 0);
        gsap.to(wire, { strokeDashoffset: 0, duration: 0.6, ease: "power1.inOut", delay: 0.2 + depth * LEVEL });
      }
      for (const bud of gsap.utils.toArray<SVGGElement>("[data-bud]")) {
        const start = 0.75 + Number(bud.dataset.depth ?? 0) * LEVEL;
        gsap.to(bud, { opacity: 1, duration: 0.2, delay: start });
        const core = bud.querySelector<SVGCircleElement>("[data-bud-core]");
        if (core) gsap.from(core, { attr: { r: 0 }, duration: 0.45, ease: "back.out(2.5)", delay: start });
      }
      for (const halo of gsap.utils.toArray<SVGCircleElement>("[data-bud-halo]")) {
        const radius = Number(halo.getAttribute("r") ?? 14);
        gsap.fromTo(halo, { attr: { r: radius }, opacity: 0.18 }, { attr: { r: radius * 1.9 }, opacity: 0, duration: 2.4, ease: "sine.out", repeat: -1, delay: 3 + Math.random() * 1.5 });
      }

      // The screenshot starts tilted back (CSS) and stands up as it scrolls into view.
      const shot = document.querySelector<HTMLElement>("[data-hero-shot]");
      if (shot) {
        gsap.fromTo(shot, { rotateX: 14, scale: 0.95 }, { rotateX: 0, scale: 1, ease: "none", scrollTrigger: { trigger: shot, start: "top 92%", end: "top 30%", scrub: 0.6 } });
      }

      for (const element of gsap.utils.toArray<HTMLElement>("[data-reveal]")) {
        gsap.from(element, { y: 28, opacity: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: element, start: "top 88%", once: true } });
      }
      for (const group of gsap.utils.toArray<HTMLElement>("[data-stagger]")) {
        gsap.from(group.children, { y: 24, opacity: 0, duration: 0.7, ease: "power3.out", stagger: 0.12, scrollTrigger: { trigger: group, start: "top 86%", once: true } });
      }
    });

    // Pointer effects only where there is a fine pointer that hovers (not on touch screens).
    media.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
      for (const area of gsap.utils.toArray<HTMLElement>("[data-tilt]")) {
        const target = area.firstElementChild as HTMLElement | null;
        if (!target) continue;
        const rotateX = gsap.quickTo(target, "rotateX", { duration: 0.6, ease: "power3.out" });
        const rotateY = gsap.quickTo(target, "rotateY", { duration: 0.6, ease: "power3.out" });
        const move = (event: PointerEvent) => {
          const box = area.getBoundingClientRect();
          rotateY(((event.clientX - box.left) / box.width - 0.5) * 6);
          rotateX(-((event.clientY - box.top) / box.height - 0.5) * 4);
        };
        const leave = () => {
          rotateX(0);
          rotateY(0);
        };
        area.addEventListener("pointermove", move);
        area.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          area.removeEventListener("pointermove", move);
          area.removeEventListener("pointerleave", leave);
        });
      }
      for (const button of gsap.utils.toArray<HTMLElement>("[data-magnetic]")) {
        const x = gsap.quickTo(button, "x", { duration: 0.4, ease: "power3.out" });
        const y = gsap.quickTo(button, "y", { duration: 0.4, ease: "power3.out" });
        const move = (event: PointerEvent) => {
          const box = button.getBoundingClientRect();
          x((event.clientX - box.left - box.width / 2) * 0.22);
          y((event.clientY - box.top - box.height / 2) * 0.3);
        };
        const leave = () => {
          x(0);
          y(0);
        };
        button.addEventListener("pointermove", move);
        button.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          button.removeEventListener("pointermove", move);
          button.removeEventListener("pointerleave", leave);
        });
      }
    });

    return () => {
      for (const cleanup of cleanups) cleanup();
      media.revert();
    };
  }, []);

  return null;
}
