"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  BILL_DENOMINATIONS,
  BILL_DENOMINATIONS_MONO,
  PAPER_COOL,
  PAPER_WARM,
  createBillTexture,
} from "@/lib/three/bill-textures";
import { THEME_CHANGE_EVENT } from "@/lib/theme";

/**
 * Lee un token de color de globals.css y lo convierte a algo que three.js
 * entienda. Los tokens son oklch(); THREE.Color no parsea oklch, así que se
 * pinta en un canvas de 1×1 y se lee el sRGB resultante — el mismo camino
 * que usa el navegador.
 */
function readToken(name: string, fallback: number): THREE.Color {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    if (!raw) return new THREE.Color(fallback);
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return new THREE.Color(fallback);
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return new THREE.Color(r / 255, g / 255, b / 255);
  } catch {
    return new THREE.Color(fallback);
  }
}

const BILL_ASPECT = 660 / 300;
const BILL_COUNT = 26;

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
  texIndex: number;
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
    // La niebla tiene que igualar el fondo de la página o los billetes se
    // desvanecen hacia un color que no está ahí. En Papel es casi blanco.
    scene.fog = new THREE.Fog(readToken("--surface", 0x12141e), 12, 27);

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

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(-6, 8, 10);
    scene.add(key);
    // El relleno toma el acento: en Plano azulea las sombras, en Papel las
    // levanta. Sobre papel hace falta más luz ambiental o los billetes se
    // ven sucios contra el fondo claro.
    const rim = new THREE.PointLight(readToken("--accent", 0x88aaff), 0.9, 40);
    rim.position.set(4, -2, 8);
    scene.add(rim);



    // Dos juegos: a color para Plano, de grabado para Papel. Cinco texturas
    // de 660×300 cada uno; el costo es despreciable y evita regenerar al
    // cambiar de tema.
    const texturesColor = BILL_DENOMINATIONS.map((d) =>
      createBillTexture(d, PAPER_WARM),
    );
    const texturesMono = BILL_DENOMINATIONS_MONO.map((d) =>
      createBillTexture(d, PAPER_COOL),
    );
    const bills: FloatingBill[] = [];

    for (let i = 0; i < BILL_COUNT; i++) {
      const texIndex = i % texturesColor.length;
      const tex = texturesColor[texIndex];
      const scale = 1.5 + Math.random() * 0.95;
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

      // Sesgado a la derecha a propósito: el texto vive a la izquierda,
      // así que los billetes forman una deriva diagonal en vez de esparcirse.
      const baseX = 5.5 + Math.random() * 15;
      const baseRotation = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 1.0,
      );
      mesh.position.set(baseX, (Math.random() - 0.5) * 27, -2.5 - Math.random() * 11);
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
        texIndex,
      });
    }

    // Los billetes NO cambian de color con el tema: un billete de 500 es del
    // mismo color de día y de noche. Son contenido, no cromo.
    //
    // Lo que sí cambia es la luz y la niebla. Y va al revés de lo intuitivo:
    // sobre papel hay que BAJAR la exposición, no subirla. Con más luz los
    // billetes se lavan hasta volverse manchas pastel; lo que necesitan
    // contra un fondo claro es contraste, o sea menos luz y menos multiplicador
    // blanco en el material.
    function repaintForTheme() {
      const surface = readToken("--surface", 0x12141e);
      const lum = surface.r * 0.2126 + surface.g * 0.7152 + surface.b * 0.0722;
      const light = lum > 0.5;

      if (scene.fog) {
        const fog = scene.fog as THREE.Fog;
        fog.color.copy(surface);
        // Sobre papel la niebla se aleja: si no, los billetes del fondo se
        // desvanecen a blanco y desaparecen.
        fog.near = light ? 15 : 13;
        fog.far = light ? 34 : 30;
      }

      rim.color.copy(readToken("--accent", 0x88aaff));
      rim.intensity = light ? 0.12 : 0.9;
      ambient.intensity = light ? 0.95 : 0.5;
      key.intensity = light ? 0.22 : 0.85;

      for (const bill of bills) {
        const mat = bill.mesh.material as THREE.MeshStandardMaterial;
        const tex = light
          ? texturesMono[bill.texIndex]
          : texturesColor[bill.texIndex];
        mat.map = tex;

        // Opacos en Papel: la transparencia sobre blanco es justo lo que
        // producía los parches marrones al encimarse. Con el buffer de
        // profundidad, el billete de enfrente simplemente tapa al de atrás.
        mat.transparent = !light;
        mat.opacity = light ? 1 : 0.96;

        if (light) {
          // Y sin modelado. Los planos son DoubleSide, así que el que da la
          // espalda a la luz se renderiza casi carbón — de ahí venían los
          // billetes desparejos, unos grises y otros casi blancos. Pasarlo
          // todo a emisivo apaga la iluminación: cada billete queda del mismo
          // tono mire a donde mire, que es como se comporta una marca de agua.
          // La niebla sigue actuando, así que la profundidad no se pierde.
          mat.emissiveMap = tex;
          mat.emissive.setScalar(1);
          mat.emissiveIntensity = 1;
          mat.color.setScalar(0);
        } else {
          mat.emissiveMap = null;
          mat.emissive.setScalar(0);
          mat.color.setScalar(0.92);
        }
        mat.needsUpdate = true;
      }
    }
    repaintForTheme();
    window.addEventListener(THEME_CHANGE_EVENT, repaintForTheme);
    const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    schemeQuery.addEventListener("change", repaintForTheme);

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
            bill.baseX + Math.sin(t * bill.swaySpeed + bill.swayOffset) * 1.5;
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
      window.removeEventListener(THEME_CHANGE_EVENT, repaintForTheme);
      schemeQuery.removeEventListener("change", repaintForTheme);
      for (const bill of bills) {
        bill.mesh.geometry.dispose();
        (bill.mesh.material as THREE.Material).dispose();
      }
      texturesColor.forEach((t) => t.dispose());
      texturesMono.forEach((t) => t.dispose());
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
