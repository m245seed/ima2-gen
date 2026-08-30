import { useCallback, useEffect, useMemo, useRef, type ReactNode, type KeyboardEvent } from "react";
import { useI18n } from "../../i18n";
import { AgentContextTabs } from "./AgentContextTabs";
import { ImageIcon } from "./AgentIcons";
import { AgentResultThumb } from "./AgentResultThumb";
import { AgentSafeImage } from "./AgentSafeImage";
import type { AgentContextTab, AgentImageHandle } from "./agentTypes";

type Props = {
  currentImage: AgentImageHandle | null;
  images: AgentImageHandle[];
  activeTab: AgentContextTab;
  onTabChange: (tab: AgentContextTab) => void;
  onImageSelect: (imageId: string) => void;
  headerAction?: ReactNode;
};

function TabBody({ activeTab, currentImage }: Pick<Props, "activeTab" | "currentImage">) {
  const { t } = useI18n();
  if (activeTab === "refs") return <div className="agent-tab-empty">{t("agent.noRefs")}</div>;
  if (activeTab === "web") return <div className="agent-tab-empty">{t("agent.noWeb")}</div>;
  if (activeTab === "memory") {
    return (
      <ul className="agent-memory-list">
        <li>{t("agent.memoryItemStyle")}</li>
        <li>{t("agent.memoryItemSubject")}</li>
      </ul>
    );
  }
  return (
    <dl className="agent-image-meta">
      <div><dt>{t("agent.filename")}</dt><dd>{currentImage?.filename ?? "-"}</dd></div>
      <div><dt>{t("agent.prompt")}</dt><dd>{currentImage?.prompt ?? currentImage?.revisedPrompt ?? "-"}</dd></div>
    </dl>
  );
}


export function AgentImagePane({ currentImage, images, activeTab, onTabChange, onImageSelect, headerAction }: Props) {
  const { t } = useI18n();
  const variantRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const currentIndex = useMemo(
    () => images.findIndex((image) => image.id === currentImage?.id),
    [currentImage?.id, images],
  );

  useEffect(() => {
    if (!currentImage?.id) return;
    variantRefs.current[currentImage.id]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentImage?.id]);

  const selectByIndex = useCallback((index: number) => {
    const image = images[index];
    if (image) onImageSelect(image.id);
  }, [images, onImageSelect]);

  const handleImageKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (images.length === 0) return;
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = Math.max(0, baseIndex - 1);
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = Math.min(images.length - 1, baseIndex + 1);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = images.length - 1;
    if (nextIndex === null || nextIndex === baseIndex) return;
    event.preventDefault();
    selectByIndex(nextIndex);
  }, [currentIndex, images.length, selectByIndex]);

  return (
    <section className="agent-image" aria-label={t("agent.imagePane")}>
      <header className="agent-pane-header">
        <div className="agent-pane-header__title">
          <span>{t("agent.imagePane")}</span>
          <strong>{t("agent.currentImage")}</strong>
        </div>
        {headerAction}
      </header>
      <div
        className="agent-image__preview"
        tabIndex={images.length > 1 ? 0 : undefined}
        onKeyDown={handleImageKeyDown}
        aria-label={images.length > 1 ? t("agent.variants") : undefined}
      >
        {currentImage ? (
          <AgentSafeImage
            src={currentImage.url}
            alt={currentImage.prompt ?? t("agent.imageAlt")}
            fallbackClassName="agent-image__empty"
            iconSize={34}
          />
        ) : <div className="agent-image__empty"><ImageIcon size={34} /><span>{t("agent.noImage")}</span></div>}
      </div>
      <div className="agent-image__variants" aria-label={t("agent.variants")} onKeyDown={handleImageKeyDown}>
        {images.map((image) => (
          <AgentResultThumb
            key={image.id}
            ref={(node) => {
              variantRefs.current[image.id] = node;
            }}
            image={image}
            selected={image.id === currentImage?.id}
            onSelect={onImageSelect}
          />
        ))}
      </div>
      <AgentContextTabs activeTab={activeTab} onChange={onTabChange} />
      <TabBody activeTab={activeTab} currentImage={currentImage} />
    </section>
  );
}
