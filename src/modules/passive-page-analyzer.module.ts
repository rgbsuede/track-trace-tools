import { MessageType } from "@/consts";
import { IAtomicService } from "@/interfaces";
import { debugLogFactory } from "@/utils/debug";
import { timer } from "rxjs";
import { analyticsManager } from "./analytics-manager.module";
import { authManager } from "./auth-manager.module";
import { upsertManager } from "./upsert-manager.module";

const debugLog = debugLogFactory("modules/passive-page-analyzer.module.ts");

class PassivePageAnalyzer implements IAtomicService {
  lastObservedActiveModalName: string | null = null;

  async init() {
    timer(10000, 2000).subscribe(() => {
      const modal = this.activeMetrcModalOrNull();

      if (!modal) {
        this.lastObservedActiveModalName = null;
        return;
      }

      this.recordModalState(modal as HTMLElement);

      try {
        this.maybeRecordFieldNames(modal as HTMLElement);
      } catch (e) {
        console.error(e);
      }
    });
  }

  activeMetrcModalOrNull() {
    return document.querySelector(".k-widget.k-window");
  }

  modalTitleOrError(modalElement: HTMLElement): string {
    // @ts-ignore
    const title: string = modalElement.querySelector(".k-window-title")?.innerText.trim();

    if (!title) {
      throw new Error("Could not acquire modal title");
    }

    return title;
  }

  recordModalState(modalElement: HTMLElement) {
    const activeModalName: string = this.modalTitleOrError(modalElement);

    if (this.lastObservedActiveModalName !== activeModalName) {
      analyticsManager.track(MessageType.OPENED_METRC_MODAL, {
        modalName: activeModalName
      });
    }

    this.lastObservedActiveModalName = activeModalName;
  }

  async maybeRecordFieldNames(modalElement: HTMLElement) {
    const authState = await authManager.authStateOrError();

    const title = this.modalTitleOrError(modalElement);

    const key = title.replace(/\s/g, "");

    const ngModelElements: HTMLElement[] = [
      ...modalElement.querySelectorAll("[ng-model]")
    ] as HTMLElement[];

    const fieldNames: string[] = [
      ...new Set(
        ngModelElements
          .map((x: HTMLElement) => x.getAttribute("ng-model"))
          .filter(x => !!x)
          .sort()
      )
    ] as string[];

    if (!fieldNames.length) {
      console.error("fieldNames empty");
      return;
    }

    upsertManager.maybeSendKeyval({
      key: key + "ModalFields",
      category: "MODAL_FIELDS",
      dataType: "json",
      authState,
      data: {
        fieldNames
      }
    });
    const repeaterDataKeys: string[] = [
      ...new Set(
        ngModelElements
          .map((x: HTMLElement) => {
            let attr: string | null = null;

            if (x.hasAttribute("ng-options")) {
              attr = x.getAttribute("ng-options");
            } else if (x.hasAttribute("typeahead")) {
              attr = x.getAttribute("typeahead");
            }

            if (!attr) {
              return null;
            }

            const match = attr.match(/(repeaterData.[\w]+)/);

            if (!match) {
              return null;
            }

            return match[1];
          })
          .filter(x => !!x)
          .sort()
      )
    ] as string[];

    if (!repeaterDataKeys.length) {
      throw new Error("repeaterDataKeys empty");
    }

    upsertManager.maybeSendKeyval({
      key: key + "RepeaterDataKeys",
      category: "REPEATER_DATA_KEYS",
      dataType: "json",
      authState,
      data: {
        repeaterDataKeys
      }
    });
  }
}

export let passivePageAnalyzer = new PassivePageAnalyzer();
