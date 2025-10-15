export type StateKey = string;

export type StateMeta = {
  label: string;
  color?: string; // Mantine color name or CSS string
};

export type StateConfig = {
  states: Record<StateKey, StateMeta>;
  transitions: Record<StateKey, StateKey[]>;
  // Optional confirm modal metadata per from->to transition
  transitionMeta?: Record<
    string,
    {
      color?: string;
      title?: string;
      text?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }
  >;
  fallbackLabel?: (state: string) => string;
  fallbackColor?: (state: string) => string;
};

export class StateModel {
  private currentState: StateKey;
  constructor(private config: StateConfig, initialState: StateKey) {
    this.currentState = initialState;
  }
  get current() {
    return this.currentState;
  }
  setCurrent(next: StateKey) {
    this.currentState = next;
  }
  getLabel(state: StateKey = this.currentState): string {
    const meta = this.config.states[state];
    if (meta?.label) return meta.label;
    return (this.config.fallbackLabel?.(state) ?? state) || "Unknown";
  }
  getColor(state: StateKey = this.currentState): string {
    const meta = this.config.states[state];
    if (meta?.color) return meta.color;
    return this.config.fallbackColor?.(state) ?? "gray";
  }
  getPossibleTransitions(from: StateKey = this.currentState): StateKey[] {
    return this.config.transitions[from] || [];
  }
  getTransitionMeta(from: StateKey, to: StateKey) {
    const key = `${from}->${to}`;
    return this.config.transitionMeta?.[key];
  }
  transitionTo(newState: StateKey): boolean {
    if (this.getPossibleTransitions().includes(newState)) {
      this.currentState = newState;
      return true;
    }
    return false;
  }
  getAllStates(): Array<{ key: StateKey; label: string; color?: string }> {
    return Object.entries(this.config.states).map(([key, meta]) => ({
      key,
      label: meta.label,
      color: meta.color,
    }));
  }
}
