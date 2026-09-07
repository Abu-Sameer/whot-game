/**
 * One link between two phones playing the same game.
 *
 * There is no server anywhere in here. A browser cannot discover another phone
 * by itself — Web Bluetooth only ever talks to peripherals and can never
 * advertise as one, and nothing exposes Wi-Fi Direct or a listening socket — so
 * WebRTC is the only transport available, and the one thing it normally needs a
 * server for is the handshake. Passing that handshake by QR code replaces the
 * server: once the two descriptions have been swapped, the data channel runs
 * directly between the phones over the local network, with no internet
 * involved at any point.
 *
 * A host that wants more than one guest simply calls createHost() again — one
 * of these per guest, each with its own handshake.
 */
import { decodeSignal, encodeSignal } from "./signal";

// Deliberately empty. STUN and TURN exist to get a connection out through the
// internet; this game pairs phones on one Wi-Fi network with no internet at
// all, so only local candidates are gathered and nothing leaves the network.
const CONFIG: RTCConfiguration = { iceServers: [] };

const LABEL = "whot";

// Waiting for the closing candidate can hang on engines that never send it.
// One local candidate is enough to reach a phone on the same network, so after
// this the code goes out with whatever has been gathered.
const GATHER_TIMEOUT = 2500;

export interface PeerHandlers {
  onMessage: (message: unknown) => void;
  onOpen: () => void;
  onClose: () => void;
}

export interface Connection {
  send(message: unknown): void;
  close(): void;
}

/** A half-finished pairing: a code to show, and the link it will become. */
export interface Pairing {
  /** Show this to the other phone. */
  code: string;
  connection: Connection;
  /** Host only: the code the guest shows back, to finish the handshake. */
  accept?: (answerCode: string) => Promise<void>;
}

/** Resolves once ICE has settled, so the code carries a route to this phone. */
function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      pc.removeEventListener("icecandidate", onCandidate);
      resolve();
    };
    // A null candidate is how the browser says it has found them all.
    const onCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (!event.candidate) finish();
    };
    const timer = setTimeout(finish, GATHER_TIMEOUT);
    pc.addEventListener("icecandidate", onCandidate);
  });
}

function attach(
  pc: RTCPeerConnection,
  channel: RTCDataChannel,
  handlers: PeerHandlers,
): Connection {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    handlers.onClose();
  };

  channel.onopen = () => handlers.onOpen();
  channel.onclose = close;
  channel.onerror = close;
  channel.onmessage = (event) => {
    try {
      handlers.onMessage(JSON.parse(String(event.data)));
    } catch {
      // A frame we cannot read is not worth tearing the game down over.
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      close();
    }
  };

  return {
    send(message) {
      if (channel.readyState !== "open") return;
      channel.send(JSON.stringify(message));
    },
    close() {
      closed = true;
      try {
        channel.close();
      } finally {
        pc.close();
      }
    },
  };
}

// Both sides open the channel themselves against a fixed id rather than one
// side offering it in-band. That way each has a channel object from the start
// and the two ends of this module stay symmetrical.
function openChannel(pc: RTCPeerConnection): RTCDataChannel {
  return pc.createDataChannel(LABEL, {
    negotiated: true,
    id: 0,
    ordered: true,
  });
}

/** Invites one guest, and produces the code they read first. */
export async function createHost(handlers: PeerHandlers): Promise<Pairing> {
  const pc = new RTCPeerConnection(CONFIG);
  // Created before the offer, so the offer describes the channel.
  const channel = openChannel(pc);
  const connection = attach(pc, channel, handlers);

  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  const local = pc.localDescription;
  if (!local) throw new Error("Could not start a game on this device.");

  return {
    code: await encodeSignal(local.sdp),
    connection,
    async accept(answerCode: string) {
      await pc.setRemoteDescription({
        type: "answer",
        sdp: await decodeSignal(answerCode),
      });
    },
  };
}

/** Joins a game from the host's code, and produces the code to show back. */
export async function createGuest(
  offerCode: string,
  handlers: PeerHandlers,
): Promise<Pairing> {
  const offer = await decodeSignal(offerCode);
  const pc = new RTCPeerConnection(CONFIG);
  const channel = openChannel(pc);
  const connection = attach(pc, channel, handlers);

  await pc.setRemoteDescription({ type: "offer", sdp: offer });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  const local = pc.localDescription;
  if (!local) throw new Error("Could not join the game from this device.");

  return { code: await encodeSignal(local.sdp), connection };
}
