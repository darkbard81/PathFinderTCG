import type { PF2eGridCell, PF2eGridTable, PF2eGridTableItem } from '../components/PF2eGridTable';

export interface PF2eGridTableSelectionControllerConfig {
  readonly items: readonly PF2eGridTableItem[];
  readonly initialSelectedId?: string;
  readonly onSelectionChange?: (item: PF2eGridTableItem, index: number) => void;
}

export class PF2eGridTableSelectionController {
  private readonly table: PF2eGridTable;
  private readonly itemById = new Map<string, PF2eGridTableItem>();
  private readonly onSelectionChange?: (item: PF2eGridTableItem, index: number) => void;
  private selectedId?: string;

  constructor(table: PF2eGridTable, config: PF2eGridTableSelectionControllerConfig) {
    this.table = table;
    this.onSelectionChange = config.onSelectionChange;
    for (const item of config.items) {
      if (this.itemById.has(item.id)) {
        throw new Error(`Duplicate PF2e grid-table item id: ${item.id}`);
      }
      this.itemById.set(item.id, item);
    }

    this.table
      .on('cell.over', this.handleCellOver)
      .on('cell.out', this.handleCellOut)
      .on('cell.down', this.handleCellDown)
      .on('cell.up', this.handleCellUp)
      .on('cell.click', this.handleCellClick);

    this.setSelectedItem(config.initialSelectedId);
  }

  setSelectedItem(itemId: string | undefined): this {
    if (itemId !== undefined && !this.itemById.has(itemId)) {
      throw new Error(`Unknown PF2e grid-table item: ${itemId}`);
    }
    this.selectedId = itemId;
    for (const id of this.itemById.keys()) {
      this.table.setItemVisualState(id, id === itemId ? 'selected' : 'idle');
    }
    this.table.refreshItemVisualStates();
    return this;
  }

  destroy(): void {
    this.table
      .off('cell.over', this.handleCellOver)
      .off('cell.out', this.handleCellOut)
      .off('cell.down', this.handleCellDown)
      .off('cell.up', this.handleCellUp)
      .off('cell.click', this.handleCellClick);
  }

  private readonly handleCellOver = (cell: PF2eGridCell): void => {
    cell.setVisualState(cell.id === this.selectedId ? 'selected' : 'hover');
  };

  private readonly handleCellOut = (cell: PF2eGridCell): void => {
    cell.setVisualState(cell.id === this.selectedId ? 'selected' : 'idle');
  };

  private readonly handleCellDown = (cell: PF2eGridCell): void => {
    cell.setVisualState('pressed');
  };

  private readonly handleCellUp = (cell: PF2eGridCell): void => {
    cell.setVisualState(cell.id === this.selectedId ? 'selected' : 'hover');
  };

  private readonly handleCellClick = (cell: PF2eGridCell, index: number): void => {
    const item = this.itemById.get(cell.id);
    if (!item) {
      return;
    }
    this.setSelectedItem(item.id);
    this.onSelectionChange?.(item, index);
  };
}
