import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";

type PlatformConfig = {
  position: THREE.Vector3;
  size: THREE.Vector3;
};

const PLATFORM_CONFIGS: PlatformConfig[] = [
  { position: new THREE.Vector3(0, 20, 0), size: new THREE.Vector3(48, 40, 48) },
  { position: new THREE.Vector3(180, 26, 180), size: new THREE.Vector3(42, 52, 42) },
  { position: new THREE.Vector3(-180, 32, 180), size: new THREE.Vector3(42, 64, 42) },
  { position: new THREE.Vector3(-180, 24, -180), size: new THREE.Vector3(42, 48, 42) },
  { position: new THREE.Vector3(180, 22, -180), size: new THREE.Vector3(42, 44, 42) }
];

function addStaticBox(
  scene: THREE.Scene,
  world: RAPIER.World,
  rapier: typeof RAPIER,
  position: THREE.Vector3,
  size: THREE.Vector3,
  material: THREE.Material
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const collider = rapier.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
  collider.setTranslation(position.x, position.y, position.z);
  collider.setFriction(1.4);
  collider.setRestitution(0.1);
  world.createCollider(collider);
}

function addHelipad(scene: THREE.Scene, position: THREE.Vector3, radius: number): void {
  const pad = new THREE.Group();
  pad.position.copy(position);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.6, 40),
    new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.92 })
  );
  base.receiveShadow = true;
  base.castShadow = true;
  pad.add(base);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.7, radius * 0.82, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.32;
  pad.add(ring);

  const hBar = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 0.72, 0.2, radius * 0.12),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x505050 })
  );
  hBar.position.y = 0.35;
  const hLeft = new THREE.Mesh(
    new THREE.BoxGeometry(radius * 0.12, 0.2, radius * 0.62),
    hBar.material
  );
  hLeft.position.set(-radius * 0.2, 0.35, 0);
  const hRight = hLeft.clone();
  hRight.position.x = radius * 0.2;

  pad.add(hBar);
  pad.add(hLeft);
  pad.add(hRight);
  scene.add(pad);
}

function addRoad(scene: THREE.Scene, position: THREE.Vector3, width: number, length: number, rotationY = 0): void {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = rotationY;

  const road = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.12, length),
    new THREE.MeshStandardMaterial({ color: 0x3f4854, roughness: 0.95 })
  );
  road.receiveShadow = true;

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xf2e85b });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, length - 6), lineMaterial);
  stripe.position.y = 0.09;
  group.add(road);
  group.add(stripe);
  scene.add(group);
}

export function createEnvironment(
  scene: THREE.Scene,
  world: RAPIER.World,
  rapier: typeof RAPIER
): void {
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f9f59,
    roughness: 1
  });
  const platformMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa3ac,
    roughness: 0.95
  });

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(2400, 6, 2400),
    groundMaterial
  );
  ground.position.set(0, -3, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const groundCollider = rapier.ColliderDesc.cuboid(1200, 3, 1200);
  groundCollider.setTranslation(0, -3, 0);
  groundCollider.setFriction(1.6);
  world.createCollider(groundCollider);

  const grid = new THREE.GridHelper(1800, 72, 0xf4f6f8, 0x7db26a);
  grid.position.y = 0.05;
  scene.add(grid);

  addRoad(scene, new THREE.Vector3(0, 0.12, 120), 28, 1600);
  addRoad(scene, new THREE.Vector3(120, 0.12, 0), 28, 1600, Math.PI / 2);

  PLATFORM_CONFIGS.forEach(({ position, size }) => {
    addStaticBox(scene, world, rapier, position, size, platformMaterial);
    addHelipad(
      scene,
      new THREE.Vector3(position.x, position.y + size.y / 2 + 0.35, position.z),
      Math.min(size.x, size.z) * 0.36
    );
  });

  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0xff9640,
    emissive: 0x441900,
    roughness: 0.3
  });

  [
    new THREE.Vector3(60, 16, 60),
    new THREE.Vector3(-70, 14, 90),
    new THREE.Vector3(-120, 18, -70),
    new THREE.Vector3(130, 14, -90)
  ].forEach((position) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 28, 10), beaconMaterial);
    tower.position.copy(position);
    tower.castShadow = true;
    tower.receiveShadow = true;
    scene.add(tower);
  });
}
