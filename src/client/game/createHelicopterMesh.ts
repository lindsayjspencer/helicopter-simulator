import * as THREE from "three";

export type HelicopterVisual = {
  root: THREE.Group;
  yawGroup: THREE.Group;
  tiltGroup: THREE.Group;
  bodyGroup: THREE.Group;
  mainRotor: THREE.Group;
  tailRotor: THREE.Group;
};

export function createHelicopterVisual(color: number): HelicopterVisual {
  const root = new THREE.Group();
  const yawGroup = new THREE.Group();
  const tiltGroup = new THREE.Group();
  const helicopter = new THREE.Group();

  root.add(yawGroup);
  yawGroup.add(tiltGroup);
  tiltGroup.add(helicopter);

  const cockpitShape = new THREE.Shape();
  cockpitShape.moveTo(0, 0);
  cockpitShape.bezierCurveTo(0, 5, 5, 3, 5, 2);
  cockpitShape.bezierCurveTo(5, -3, 0, -5, 0, 0);

  const fuseShape = new THREE.Shape();
  fuseShape.moveTo(0, 0);
  fuseShape.bezierCurveTo(0, 0, 5, 2, 10, -1);
  fuseShape.bezierCurveTo(5, -2, 0, -2, 0, 0);

  const cockpitGeometry = new THREE.ExtrudeGeometry(cockpitShape, {
    steps: 1,
    depth: 1,
    bevelEnabled: true,
    bevelThickness: 6,
    bevelSize: 3,
    bevelSegments: 9
  });

  const cockpitWireGeometry = new THREE.ExtrudeGeometry(cockpitShape, {
    steps: 1,
    depth: 1,
    bevelEnabled: true,
    bevelThickness: 6,
    bevelSize: 3,
    bevelSegments: 3
  });

  const fuseGeometry = new THREE.ExtrudeGeometry(fuseShape, {
    steps: 1,
    depth: 1,
    bevelEnabled: true,
    bevelThickness: 2,
    bevelSize: 2,
    bevelSegments: 6
  });

  const bladeGeometry = new THREE.SphereGeometry(
    10,
    30,
    6,
    0,
    Math.PI * 0.06,
    Math.PI * 0.5,
    Math.PI * 0.05
  );
  const ringGeometry = new THREE.TorusGeometry(2, 0.5, 7, 5);
  const bladePoleGeometry = new THREE.CylinderGeometry(0.2, 0.2, 8, 10);
  const tubesGeometry = new THREE.TorusKnotGeometry(5.4, 1, 100, 20, 1, 7);
  const bladeBaseGeometry = new THREE.TorusKnotGeometry(1, 4.2, 100, 7, 2, 20);
  const fuselageGeometry = new THREE.CylinderGeometry(2, 0.8, 30, 10);
  const legGeometry = new THREE.CapsuleGeometry(1, 25, 8, 16);
  const legStandGeometry = new THREE.SphereGeometry(
    7,
    8,
    8,
    Math.PI * 0.44,
    Math.PI * 0.12,
    Math.PI * 0.15,
    Math.PI * 0.7
  );

  const orangeMetal = new THREE.MeshPhysicalMaterial({
    color: 0xdf8600,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const accentMetal = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 1,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.7,
    flatShading: false,
    side: THREE.DoubleSide
  });
  const legStandMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x545454,
    roughness: 1,
    metalness: 0,
    flatShading: false,
    side: THREE.DoubleSide
  });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0,
    opacity: 0.4,
    transparent: true,
    envMapIntensity: 20,
    depthWrite: false,
    premultipliedAlpha: true
  });
  const tubesMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const wireMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });

  const cockpit = new THREE.Mesh(cockpitGeometry, glassMaterial);
  const cockpitWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(cockpitWireGeometry),
    wireMaterial
  );
  cockpit.castShadow = true;
  cockpitWire.scale.set(1.02, 1.02, 1.02);

  const cockpitGroup = new THREE.Group();
  cockpitGroup.add(cockpit);
  cockpitGroup.add(cockpitWire);
  cockpitGroup.position.set(-6, 0, -0.5);
  helicopter.add(cockpitGroup);

  const fuse = new THREE.Mesh(fuseGeometry, accentMetal);
  const fuse2 = fuse.clone();
  const ring = new THREE.Mesh(ringGeometry, orangeMetal);
  const tubes = new THREE.Mesh(tubesGeometry, tubesMaterial);
  const bladePole = new THREE.Mesh(bladePoleGeometry, accentMetal);
  const bladePole2 = bladePole.clone();
  const bladePole3 = bladePole.clone();
  const bladeBase = new THREE.Mesh(bladeBaseGeometry, orangeMetal);
  const blade = new THREE.Mesh(bladeGeometry, orangeMetal);
  const fuselage = new THREE.Mesh(fuselageGeometry, accentMetal);
  const fuselage2 = new THREE.Mesh(fuselageGeometry, orangeMetal);

  [fuse, fuse2, ring, tubes, bladePole, bladePole2, bladePole3, bladeBase, blade, fuselage, fuselage2].forEach(
    (mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  );

  ring.position.x = 31;

  fuselage.rotation.z = Math.PI / 2;
  fuselage.position.x = 15;
  fuselage.scale.set(0.8, 0.93, 0.8);

  fuse.rotation.y = -Math.PI / 20;
  fuse.position.set(3, 0.5, -2.5);
  fuse2.rotation.y = Math.PI / 20;
  fuse2.position.set(3, 0.5, 1.5);

  fuselage2.rotation.z = Math.PI / 2;
  fuselage2.position.x = 14;
  fuselage2.scale.set(1.2, 0.3, 1.2);

  const fuseGroup = new THREE.Group();
  fuseGroup.add(fuselage);
  fuseGroup.add(ring);
  fuseGroup.add(fuse);
  fuseGroup.add(fuse2);
  fuseGroup.add(fuselage2);
  helicopter.add(fuseGroup);

  tubes.rotation.x = Math.PI / 2;
  tubes.position.set(7, 3, 0);
  tubes.scale.set(0.3, 0.3, 0.3);

  const tubesGroup = new THREE.Group();
  tubesGroup.add(tubes);
  helicopter.add(tubesGroup);

  blade.scale.set(1, 15, 1);
  blade.rotation.z = -Math.PI / 2;
  blade.position.z = -1;

  const singleBlade = new THREE.Group();
  singleBlade.add(blade);
  singleBlade.scale.set(1, 1, 0.6);
  singleBlade.rotation.y = Math.PI;

  const blade2 = singleBlade.clone();
  blade2.rotation.y = -Math.PI;

  const allBlades = new THREE.Group();
  allBlades.add(singleBlade);
  allBlades.add(blade2);
  allBlades.position.set(7, -1, 0);

  const allBlades2 = allBlades.clone();
  allBlades2.rotation.y = Math.PI / 2;

  bladeBase.rotation.x = Math.PI / 2;
  bladeBase.position.set(7, 3.5, 0);
  bladeBase.scale.set(0.3, 0.3, 0.6);

  bladePole.position.set(7, 5.5, 0);
  bladePole2.position.set(7, 9, 0);
  bladePole2.scale.set(1.2, 0.1, 1.2);
  bladePole3.position.set(7, 6, 0);
  bladePole3.scale.set(1.5, 0.3, 1.5);

  const bladesGroup = new THREE.Group();
  bladesGroup.add(allBlades);
  bladesGroup.add(allBlades2);
  bladesGroup.add(bladeBase);
  bladesGroup.add(bladePole);
  bladesGroup.add(bladePole2);
  bladesGroup.add(bladePole3);
  helicopter.add(bladesGroup);

  const leg = new THREE.Mesh(legGeometry, orangeMetal);
  leg.rotation.z = Math.PI / 2;
  leg.castShadow = true;
  leg.receiveShadow = true;

  const legGroup = new THREE.Group();
  legGroup.add(leg);
  legGroup.position.z = 6;

  const legGroup2 = legGroup.clone();
  legGroup2.position.z = -6;

  const legsGroup = new THREE.Group();
  legsGroup.add(legGroup);
  legsGroup.add(legGroup2);
  legsGroup.position.set(8, -7, 0);
  helicopter.add(legsGroup);

  const legStand = new THREE.Mesh(legStandGeometry, legStandMaterial);
  legStand.castShadow = true;
  legStand.receiveShadow = true;
  legStand.rotation.x = -Math.PI / 2;
  legStand.scale.set(1, 1, 1.6);
  legStand.position.set(6, -5, 0);
  legStand.rotation.y = -Math.PI / 15;

  const legStand2 = legStand.clone();
  legStand2.position.x = -7;
  legStand2.rotation.y = Math.PI / 13;

  legsGroup.add(legStand);
  legsGroup.add(legStand2);

  helicopter.scale.set(0.3, 0.3, 0.3);
  helicopter.name = "chopper";

  helicopter.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return {
    root,
    yawGroup,
    tiltGroup,
    bodyGroup: helicopter,
    mainRotor: allBlades,
    tailRotor: allBlades2
  };
}
