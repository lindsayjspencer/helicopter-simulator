import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

import {
  createDefaultPlayerState,
  type PlayerLeftPayload,
  type PlayerSession,
  type PlayerState,
  type PlayerUpdatedPayload,
  type SessionReadyPayload
} from "../../shared/protocol";
import { createEnvironment } from "./createEnvironment";
import {
  createHelicopterVisual,
  type HelicopterVisual
} from "./createHelicopterMesh";

export type HudState = {
  thrust: number;
  altitude: number;
  groundSpeed: number;
  positionLabel: string;
  connectedPlayers: number;
};

type BootProgress = {
  label: string;
  value: number;
};

type GameControllerCallbacks = {
  onBootProgress: (progress: BootProgress) => void;
  onHudChange: (hud: HudState) => void;
  onLocalState: (state: PlayerState) => void;
};

type ControlState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
  lift: boolean;
};

type RemoteCraft = HelicopterVisual & {
  id: string;
  targetPosition: THREE.Vector3;
  targetYaw: number;
  targetPitchX: number;
  targetPitchZ: number;
};

const INITIAL_STATE = createDefaultPlayerState();
const LOCAL_RADIUS = 3.2;

function dampNumber(current: number, target: number, lambda: number, delta: number): number {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

function colorFromId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }

  const hue = (hash % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.55, 0.58).getHex();
}

export class GameController {
  private readonly container: HTMLElement;
  private readonly callbacks: GameControllerCallbacks;
  private readonly controls: ControlState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    rotateLeft: false,
    rotateRight: false,
    lift: false
  };

  private bootPromise: Promise<void> | null = null;
  private rapier: typeof RAPIER | null = null;
  private world: RAPIER.World | null = null;
  private scene: THREE.Scene | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private clock = new THREE.Clock();
  private localCraft: HelicopterVisual | null = null;
  private localBody: RAPIER.RigidBody | null = null;
  private remoteCrafts = new Map<string, RemoteCraft>();
  private paused = true;
  private sessionActive = false;
  private touchLift = false;
  private yaw = INITIAL_STATE.rotation.yaw;
  private pitchX = INITIAL_STATE.rotation.pitchX;
  private pitchZ = INITIAL_STATE.rotation.pitchZ;
  private thrust = 0.45;
  private lastTransmitAt = 0;
  private destroyed = false;
  private readonly cameraVelocity = new THREE.Vector3(0, 60, 80);
  private readonly chaseTarget = new THREE.Vector3();
  private readonly lightTarget = new THREE.Object3D();
  private chaseLight: THREE.DirectionalLight | null = null;

  constructor(container: HTMLElement, callbacks: GameControllerCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  async boot(): Promise<void> {
    if (this.bootPromise) {
      return this.bootPromise;
    }

    this.bootPromise = this.performBoot();
    return this.bootPromise;
  }

  startSession(session: SessionReadyPayload): void {
    this.sessionActive = true;
    this.resetLocalCraft();
    this.applyRemoteSnapshot(session.players);
    this.paused = false;
    this.emitLocalState(true);
  }

  resumeSession(session: SessionReadyPayload): void {
    this.sessionActive = true;
    this.applyRemoteSnapshot(session.players);
    this.paused = false;
    this.emitLocalState(true);
  }

  leaveSession(): void {
    this.sessionActive = false;
    this.paused = true;
    this.removeAllRemoteCrafts();
    this.thrust = 0.45;
    this.reportHud();
  }

  setPaused(value: boolean): void {
    this.paused = value;
  }

  setTouchLift(value: boolean): void {
    this.touchLift = value;
  }

  handlePlayerJoined(player: PlayerSession): void {
    this.upsertRemoteCraft(player);
    this.reportHud();
  }

  handlePlayerUpdated(payload: PlayerUpdatedPayload): void {
    const remote = this.remoteCrafts.get(payload.id);
    if (!remote) {
      return;
    }

    remote.targetPosition.set(
      payload.state.position.x,
      payload.state.position.y,
      payload.state.position.z
    );
    remote.targetYaw = payload.state.rotation.yaw;
    remote.targetPitchX = payload.state.rotation.pitchX;
    remote.targetPitchZ = payload.state.rotation.pitchZ;
  }

  handlePlayerLeft(payload: PlayerLeftPayload): void {
    const remote = this.remoteCrafts.get(payload.id);
    if (!remote || !this.scene) {
      return;
    }

    this.scene.remove(remote.root);
    this.remoteCrafts.delete(payload.id);
    this.reportHud();
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    window.removeEventListener("resize", this.handleResize);

    this.renderer?.setAnimationLoop(null);
    this.renderer?.dispose();
    this.container.replaceChildren();
  }

  private async performBoot(): Promise<void> {
    this.reportBoot("Loading flight physics", 0.08);
    await RAPIER.init();
    this.rapier = RAPIER;

    this.reportBoot("Preparing environment", 0.32);
    this.world = new this.rapier.World({ x: 0, y: -6.5, z: 0 });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcfe6ff);
    this.scene.fog = new THREE.Fog(0xcfe6ff, 300, 1300);

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
    this.camera.position.copy(this.cameraVelocity);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.replaceChildren(this.renderer.domElement);

    this.installLights();
    createEnvironment(this.scene, this.world, this.rapier);

    this.reportBoot("Assembling helicopter", 0.62);
    this.localCraft = createHelicopterVisual(0x5c9fff);
    this.scene.add(this.localCraft.root);
    this.localBody = this.createLocalBody();
    this.resetLocalCraft();

    this.reportBoot("Linking controls", 0.86);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);
    window.addEventListener("resize", this.handleResize);
    this.handleResize();

    this.reportBoot("Flight systems online", 1);
    this.clock.start();
    this.renderer.setAnimationLoop(this.renderFrame);
  }

  private installLights(): void {
    if (!this.scene) {
      return;
    }

    const hemisphere = new THREE.HemisphereLight(0x5d7391, 0xdcc89f, 1.2);
    this.scene.add(hemisphere);

    this.chaseLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.chaseLight.position.set(180, 260, 120);
    this.chaseLight.castShadow = true;
    this.chaseLight.shadow.mapSize.setScalar(2048);
    this.chaseLight.shadow.camera.near = 1;
    this.chaseLight.shadow.camera.far = 700;
    this.chaseLight.shadow.camera.left = -180;
    this.chaseLight.shadow.camera.right = 180;
    this.chaseLight.shadow.camera.top = 180;
    this.chaseLight.shadow.camera.bottom = -180;
    this.scene.add(this.chaseLight);
    this.scene.add(this.lightTarget);
    this.chaseLight.target = this.lightTarget;
  }

  private createLocalBody(): RAPIER.RigidBody {
    if (!this.rapier || !this.world) {
      throw new Error("Physics world is not ready.");
    }

    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(
          INITIAL_STATE.position.x,
          INITIAL_STATE.position.y,
          INITIAL_STATE.position.z
        )
        .setCanSleep(false)
        .setLinearDamping(1.8)
        .setAngularDamping(4.2)
    );

    const collider = this.rapier.ColliderDesc.ball(LOCAL_RADIUS);
    collider.setFriction(1.5);
    collider.setRestitution(0.08);
    this.world.createCollider(collider, body);

    return body;
  }

  private readonly renderFrame = (): void => {
    if (this.destroyed || !this.scene || !this.renderer || !this.camera) {
      return;
    }

    const delta = Math.min(this.clock.getDelta() || 0.016, 0.05);

    if (!this.paused && this.sessionActive) {
      this.updateFlight(delta);
      this.world?.step();
    }

    this.updateLocalVisual();
    this.updateRemoteCrafts(delta);
    this.spinRotors(delta);
    this.updateCamera(delta);
    this.reportHud();
    this.renderer.render(this.scene, this.camera);

    if (!this.paused && this.sessionActive) {
      this.emitLocalState(false);
    }
  };

  private updateFlight(delta: number): void {
    if (!this.localBody) {
      return;
    }

    const liftHeld = this.controls.lift || this.touchLift;
    this.thrust = THREE.MathUtils.clamp(
      this.thrust + (liftHeld ? delta * 0.6 : -delta * 0.28),
      0,
      1
    );

    const targetPitchX = (this.controls.left ? 0.28 : 0) + (this.controls.right ? -0.28 : 0);
    const targetPitchZ = (this.controls.forward ? 0.28 : 0) + (this.controls.backward ? -0.28 : 0);
    this.pitchX = dampNumber(this.pitchX, targetPitchX, 5.5, delta);
    this.pitchZ = dampNumber(this.pitchZ, targetPitchZ, 5.5, delta);

    const yawInput = (this.controls.rotateLeft ? 1 : 0) - (this.controls.rotateRight ? 1 : 0);
    this.yaw += yawInput * delta * 1.4;

    const currentVelocity = this.localBody.linvel();
    const bankPenalty = Math.max(0.22, 1 - Math.max(Math.abs(this.pitchX), Math.abs(this.pitchZ)) * 1.25);
    const localX = -this.pitchZ * (10 + this.thrust * 28);
    const localZ = this.pitchX * (8 + this.thrust * 22);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    const worldX = cos * localX + sin * localZ;
    const worldZ = -sin * localX + cos * localZ;
    const verticalAccel = this.thrust * 28 * bankPenalty - 7.2;
    const nextVelocity = {
      x: dampNumber(currentVelocity.x, worldX, 2.45, delta),
      y: THREE.MathUtils.clamp(currentVelocity.y + verticalAccel * delta, -18, 20),
      z: dampNumber(currentVelocity.z, worldZ, 2.45, delta)
    };

    this.localBody.setLinvel(nextVelocity, true);
  }

  private updateLocalVisual(): void {
    if (!this.localCraft || !this.localBody) {
      return;
    }

    const position = this.localBody.translation();
    this.localCraft.root.position.set(position.x, position.y, position.z);
    this.localCraft.yawGroup.rotation.y = this.yaw;
    this.localCraft.tiltGroup.rotation.x = this.pitchX;
    this.localCraft.tiltGroup.rotation.z = this.pitchZ;
  }

  private updateRemoteCrafts(delta: number): void {
    this.remoteCrafts.forEach((craft) => {
      craft.root.position.lerp(craft.targetPosition, 1 - Math.exp(-delta * 7));
      craft.yawGroup.rotation.y = dampNumber(craft.yawGroup.rotation.y, craft.targetYaw, 7, delta);
      craft.tiltGroup.rotation.x = dampNumber(craft.tiltGroup.rotation.x, craft.targetPitchX, 7, delta);
      craft.tiltGroup.rotation.z = dampNumber(craft.tiltGroup.rotation.z, craft.targetPitchZ, 7, delta);
    });
  }

  private spinRotors(delta: number): void {
    const localRotorSpeed = (this.paused ? 0.8 : 4.5 + this.thrust * 12) * delta;
    if (this.localCraft) {
      this.localCraft.mainRotor.rotation.y += localRotorSpeed;
      this.localCraft.tailRotor.rotation.y -= localRotorSpeed;
    }

    const remoteRotorSpeed = delta * 7;
    this.remoteCrafts.forEach((craft) => {
      craft.mainRotor.rotation.y += remoteRotorSpeed;
      craft.tailRotor.rotation.y -= remoteRotorSpeed;
    });
  }

  private updateCamera(delta: number): void {
    if (!this.localCraft || !this.camera || !this.chaseLight) {
      return;
    }

    const localPosition = this.localCraft.root.position;
    const offset = new THREE.Vector3(
      Math.cos(this.yaw) * 44,
      18,
      -Math.sin(this.yaw) * 44
    );

    this.chaseTarget.copy(localPosition).add(offset);
    this.camera.position.lerp(this.chaseTarget, 1 - Math.exp(-delta * 4.5));
    this.camera.lookAt(localPosition.x, localPosition.y + 6, localPosition.z);

    this.chaseLight.position.set(
      localPosition.x + 160,
      localPosition.y + 220,
      localPosition.z + 120
    );
    this.lightTarget.position.set(localPosition.x, 20, localPosition.z);
  }

  private applyRemoteSnapshot(players: PlayerSession[]): void {
    const activeIds = new Set(players.map((player) => player.id));

    this.remoteCrafts.forEach((craft, id) => {
      if (!activeIds.has(id) && this.scene) {
        this.scene.remove(craft.root);
        this.remoteCrafts.delete(id);
      }
    });

    players.forEach((player) => {
      this.upsertRemoteCraft(player);
    });

    this.reportHud();
  }

  private upsertRemoteCraft(player: PlayerSession): void {
    if (!this.scene) {
      return;
    }

    let craft = this.remoteCrafts.get(player.id);
    if (!craft) {
      const visual = createHelicopterVisual(colorFromId(player.id));
      craft = {
        ...visual,
        id: player.id,
        targetPosition: new THREE.Vector3(),
        targetYaw: 0,
        targetPitchX: 0,
        targetPitchZ: 0
      };
      craft.root.position.set(
        player.state.position.x,
        player.state.position.y,
        player.state.position.z
      );
      this.remoteCrafts.set(player.id, craft);
      this.scene.add(craft.root);
    }

    craft.targetPosition.set(
      player.state.position.x,
      player.state.position.y,
      player.state.position.z
    );
    craft.targetYaw = player.state.rotation.yaw;
    craft.targetPitchX = player.state.rotation.pitchX;
    craft.targetPitchZ = player.state.rotation.pitchZ;
    craft.root.position.copy(craft.targetPosition);
    craft.yawGroup.rotation.y = craft.targetYaw;
    craft.tiltGroup.rotation.x = craft.targetPitchX;
    craft.tiltGroup.rotation.z = craft.targetPitchZ;
  }

  private removeAllRemoteCrafts(): void {
    if (!this.scene) {
      this.remoteCrafts.clear();
      return;
    }

    this.remoteCrafts.forEach((craft) => {
      this.scene?.remove(craft.root);
    });
    this.remoteCrafts.clear();
  }

  private resetLocalCraft(): void {
    if (!this.localBody) {
      return;
    }

    this.yaw = INITIAL_STATE.rotation.yaw;
    this.pitchX = INITIAL_STATE.rotation.pitchX;
    this.pitchZ = INITIAL_STATE.rotation.pitchZ;
    this.thrust = 0.45;

    this.localBody.setTranslation(INITIAL_STATE.position, true);
    this.localBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.localBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.updateLocalVisual();
  }

  private emitLocalState(force: boolean): void {
    if (!this.localBody) {
      return;
    }

    const now = performance.now();
    if (!force && now - this.lastTransmitAt < 75) {
      return;
    }

    this.lastTransmitAt = now;
    const translation = this.localBody.translation();
    this.callbacks.onLocalState({
      position: {
        x: translation.x,
        y: translation.y,
        z: translation.z
      },
      rotation: {
        yaw: this.yaw,
        pitchX: this.pitchX,
        pitchZ: this.pitchZ
      }
    });
  }

  private reportHud(): void {
    if (!this.localBody) {
      return;
    }

    const translation = this.localBody.translation();
    const velocity = this.localBody.linvel();
    const horizontalSpeed = Math.hypot(velocity.x, velocity.z);

    this.callbacks.onHudChange({
      thrust: this.thrust,
      altitude: Math.max(0, translation.y - LOCAL_RADIUS),
      groundSpeed: horizontalSpeed,
      positionLabel: `${translation.x.toFixed(0)}, ${translation.z.toFixed(0)}`,
      connectedPlayers: this.remoteCrafts.size + (this.sessionActive ? 1 : 0)
    });
  }

  private reportBoot(label: string, value: number): void {
    this.callbacks.onBootProgress({ label, value });
  }

  private readonly handleResize = (): void => {
    if (!this.renderer || !this.camera) {
      return;
    }

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private readonly handleWindowBlur = (): void => {
    this.controls.forward = false;
    this.controls.backward = false;
    this.controls.left = false;
    this.controls.right = false;
    this.controls.rotateLeft = false;
    this.controls.rotateRight = false;
    this.controls.lift = false;
    this.touchLift = false;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    switch (event.code) {
      case "ArrowUp":
        this.controls.forward = true;
        break;
      case "ArrowDown":
        this.controls.backward = true;
        break;
      case "ArrowLeft":
        this.controls.left = true;
        break;
      case "ArrowRight":
        this.controls.right = true;
        break;
      case "KeyA":
        this.controls.rotateLeft = true;
        break;
      case "KeyD":
        this.controls.rotateRight = true;
        break;
      case "Space":
        this.controls.lift = true;
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case "ArrowUp":
        this.controls.forward = false;
        break;
      case "ArrowDown":
        this.controls.backward = false;
        break;
      case "ArrowLeft":
        this.controls.left = false;
        break;
      case "ArrowRight":
        this.controls.right = false;
        break;
      case "KeyA":
        this.controls.rotateLeft = false;
        break;
      case "KeyD":
        this.controls.rotateRight = false;
        break;
      case "Space":
        this.controls.lift = false;
        break;
      default:
        break;
    }
  };
}
