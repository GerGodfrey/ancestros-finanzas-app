"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { BILL_DENOMINATIONS, createBillTexture } from "@/lib/three/bill-textures";

const BILL_ASPECT = 660 / 300;
const BILL_COUNT = 36;

interface FloatingBill {
  mesh: THREE.Mesh;
  baseRotation: THREE.Vector3;
  rotAmplitude: THREE.Vector3;
  rotFreq: THREE.Vector3;
  rotPhase: THREE.Vector3;
  driftSpeed: number;
  swayOffset: number;
  swaySpeed: number;
  baseX: number;
}

export function BillsBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x12141e, 12, 27);

    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    camera.position.z = 14;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(-6, 8, 10);
    scene.add(key);
    const rim = new THREE.PointLight(0x88aaff, 0.9, 40);
    rim.position.set(4, -2, 8);
    scene.add(rim);

    const textures = BILL_DENOMINATIONS.map(createBillTexture);
    const bills: FloatingBill[] = [];

    for (let i = 0; i < BILL_COUNT; i++) {
      const tex = textures[i % textures.length];
      const scale = 2.3 + Math.random() * 1.9;
      const geometry = new THREE.PlaneGeometry(scale * BILL_ASPECT, scale, 1, 1);
      const material = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide,
        roughness: 0.75,
        metalness: 0,
        color: new THREE.Color(0.92, 0.92, 0.94),
      });
      const mesh = new THREE.Mesh(geometry, material);

      const baseX = (Math.random() - 0.5) * 34;
      const baseRotation = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 1.0,
      );
      mesh.position.set(baseX, (Math.random() - 0.5) * 22, 3 - Math.random() * 12);
      mesh.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
      scene.add(mesh);

      bills.push({
        mesh,
        baseRotation,
        // Oscilación suave tipo hoja meciéndose: mantiene el número casi siempre legible.
        rotAmplitude: new THREE.Vector3(
          0.05 + Math.random() * 0.05,
          0.05 + Math.random() * 0.05,
          0.1 + Math.random() * 0.08,
        ),
        rotFreq: new THREE.Vector3(
          0.1 + Math.random() * 0.08,
          0.08 + Math.random() * 0.08,
          0.12 + Math.random() * 0.1,
        ),
        rotPhase: new THREE.Vector3(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        ),
        driftSpeed: 0.02 + Math.random() * 0.03,
        swayOffset: Math.random() * Math.PI * 2,
        swaySpeed: 0.05 + Math.random() * 0.06,
        baseX,
      });
    }

    let mouseX = 0;
    let mouseY = 0;
    function handlePointerMove(e: PointerEvent) {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    }
    window.addEventListener("pointermove", handlePointerMove);

    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", handleResize);

    const timer = new THREE.Timer();
    let raf = 0;

    function animate() {
      raf = requestAnimationFrame(animate);
      timer.update();
      const t = timer.getElapsed();

      if (!prefersReducedMotion) {
        for (const bill of bills) {
          bill.mesh.rotation.x =
            bill.baseRotation.x +
            Math.sin(t * bill.rotFreq.x + bill.rotPhase.x) * bill.rotAmplitude.x;
          bill.mesh.rotation.y =
            bill.baseRotation.y +
            Math.sin(t * bill.rotFreq.y + bill.rotPhase.y) * bill.rotAmplitude.y;
          bill.mesh.rotation.z =
            bill.baseRotation.z +
            Math.sin(t * bill.rotFreq.z + bill.rotPhase.z) * bill.rotAmplitude.z;
          bill.mesh.position.y -= bill.driftSpeed * 0.03;
          bill.mesh.position.x =
            bill.baseX + Math.sin(t * bill.swaySpeed + bill.swayOffset) * 2.2;
          if (bill.mesh.position.y < -15) {
            bill.mesh.position.y = 15;
          }
        }
      }

      camera.position.x += (mouseX * 1.5 - camera.position.x) * 0.02;
      camera.position.y += (-mouseY * 1.5 - camera.position.y) * 0.02;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      for (const bill of bills) {
        bill.mesh.geometry.dispose();
        (bill.mesh.material as THREE.Material).dispose();
      }
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />
  );
}
