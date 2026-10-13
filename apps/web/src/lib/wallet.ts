import { TESTNET_NETWORK_PASSPHRASE } from "@milestone-pay/shared";

export interface WalletState {
  address: string | null;
  network: string;
  isConnected: boolean;
}

export class WalletService {
  private static instance: WalletService;
  private currentAddress: string | null = null;
  private currentNetwork: string = TESTNET_NETWORK_PASSPHRASE;

  public constructor() {
    this.syncFromStorage();
  }

  public static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  public syncFromStorage(): string | null {
    if (typeof window !== "undefined" && window.localStorage) {
      this.currentAddress = window.localStorage.getItem("milestonepay_wallet_addr");
    }
    return this.currentAddress;
  }

  public getAddress(): string | null {
    return this.syncFromStorage() ?? this.currentAddress;
  }

  public getNetwork(): string {
    return this.currentNetwork;
  }

  public verifyNetwork(network: string): void {
    const normalized = network.trim();
    const isTestnet =
      normalized === TESTNET_NETWORK_PASSPHRASE ||
      normalized.toUpperCase().includes("TEST");

    if (!isTestnet) {
      throw new Error(
        `Wrong network detected (${normalized}). MilestonePay only supports Stellar Testnet.`
      );
    }
    this.currentNetwork = TESTNET_NETWORK_PASSPHRASE;
  }

  public setAddress(addr: string | null): void {
    this.currentAddress = addr;
    if (typeof window !== "undefined" && window.localStorage) {
      if (addr) {
        window.localStorage.setItem("milestonepay_wallet_addr", addr);
      } else {
        window.localStorage.removeItem("milestonepay_wallet_addr");
      }
    }
  }

  public async connect(): Promise<string> {
    if (typeof window === "undefined") {
      throw new Error("Window not defined");
    }

    // 1. Try Freighter browser extension if installed
    const freighter = (window as any).freighterApi;
    if (freighter) {
      const isConnected = await freighter.isConnected();
      if (isConnected) {
        const network = await freighter.getNetwork();
        if (network) {
          this.verifyNetwork(network);
        }
        const address = await freighter.getPublicKey();
        if (!address) {
          throw new Error("Wallet connection rejected by user");
        }
        this.setAddress(address);
        return address;
      }
    }

    // 2. Fallback: Prompt user to enter a testnet address
    const userInput =
      typeof window.prompt === "function"
        ? window.prompt(
            "Connect Stellar Testnet Wallet:\nEnter your testnet public key (G...), or leave blank to use the demo testnet account:",
            this.currentAddress || ""
          )
        : "";

    if (userInput === null) {
      throw new Error("Wallet connection cancelled by user");
    }

    const trimmed = userInput.trim();
    if (trimmed.length > 0) {
      if (!/^G[A-Z2-7]{55}$/.test(trimmed)) {
        throw new Error("Invalid Stellar public key format (must be 56 chars starting with G)");
      }
      this.setAddress(trimmed);
      return trimmed;
    }

    const demoAddr = "GBBMY6Z3G77S6ZDR3U6L3R5J2ZCVY7W7H6T3E6KBLQ6F3J7X4H6F7K6L";
    this.setAddress(demoAddr);
    return demoAddr;
  }

  public disconnect(): void {
    this.setAddress(null);
  }
}

export const walletService = WalletService.getInstance();
