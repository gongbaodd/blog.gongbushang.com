import {
  Anchor,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useState, type CSSProperties, type ReactNode } from "react";
import CustomMantineProvider from "../../stores/CustomMantineProvider";
import { BIO_FACETS, getBioFacet, type IBioFacet } from "../bioFacets";
import { getCategoryColor } from "../postsData";
import classes from "./BioFacetVariations.module.css";

export interface IBioVariationProps {
  /** Original SSR-rendered bio description fallback (kept visible in overview mode). */
  fallbackDescription?: ReactNode;
  /** Optional initial facet ID (e.g. from URL hash `#facet=...` or tests). */
  initialFacetId?: string;
  /** Optional bridge to `ParticleHero`'s `usePostFilter().selectCategory`. */
  onSyncCanvasCategory?: (category: string) => void;
  /** Optional callback when a visitor picks a facet (for analytics wiring later). */
  onSelectFacet?: (facetId: string, variant: "chips" | "deck") => void;
}

function FacetDetailCard({
  facet,
  variantClass,
  onSyncCanvasCategory,
}: {
  facet: IBioFacet;
  variantClass: string;
  onSyncCanvasCategory?: (category: string) => void;
}) {
  const accent =
    facet.canvasCategory === "all" ? undefined : getCategoryColor(facet.canvasCategory);
  const style = accent ? ({ "--facet-accent": accent } as CSSProperties) : undefined;

  return (
    <Card withBorder radius="md" p="md" className={variantClass} style={style}>
      <Stack gap="xs">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Title order={3} size="h5">
            {facet.emoji} {facet.headline}
          </Title>
          {facet.canvasCategory !== "all" && (
            <Badge
              size="xs"
              variant="light"
              style={accent ? { background: `${accent}22`, color: accent } : undefined}
            >
              {facet.canvasCategory}
            </Badge>
          )}
        </Group>

        <Text size="sm">{facet.story}</Text>
        <Text size="xs" c="dimmed">
          {facet.quickFact}
        </Text>

        <Group gap="xs" wrap="wrap" mt={4}>
          {facet.links.map((link) => (
            <Anchor key={link.href} href={link.href} size="xs" fw={500}>
              {link.label} →
            </Anchor>
          ))}
        </Group>

        {onSyncCanvasCategory && (
          <Group justify="flex-end" mt={4}>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => onSyncCanvasCategory(facet.canvasCategory)}
            >
              Highlight {facet.canvasCategory.toUpperCase()} on canvas
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  );
}

/**
 * Low-fi Variation A: "Choose-a-Path" Persona Chips.
 * Defaults to `"overview"` so crawlers and initial visitors see the full SSR bio.
 */
export function BioPersonaChips({
  fallbackDescription,
  initialFacetId,
  onSyncCanvasCategory,
  onSelectFacet,
}: IBioVariationProps) {
  const initialSelected =
    initialFacetId && getBioFacet(initialFacetId) ? initialFacetId : "overview";
  const [selected, setSelected] = useState<string>(initialSelected);
  const [discovered, setDiscovered] = useState<string[]>(() =>
    initialSelected !== "overview" ? [initialSelected] : [],
  );
  const activeFacet = selected === "overview" ? undefined : getBioFacet(selected);

  function handleSelect(value: string) {
    if (!value) return;
    setSelected(value);
    if (value !== "overview") {
      setDiscovered((prev) => (prev.includes(value) ? prev : [...prev, value]));
      onSelectFacet?.(value, "chips");
    }
  }

  return (
    <CustomMantineProvider>
      <Stack gap="sm" className={classes.root}>
        <Group justify="space-between" align="center">
          <Text size="xs" fw={600} c="dimmed">
            Choose a facet
          </Text>
          <Badge size="xs" variant="outline" color="gray">
            {discovered.length}/{BIO_FACETS.length} explored
          </Badge>
        </Group>

        <Chip.Group value={selected} onChange={handleSelect} aria-label="Bio facets">
          <Group gap={6} wrap="wrap" className={classes.chipsWrap}>
            <Chip value="overview" size="xs" variant="outline">
              ✨ Overview
            </Chip>
            {BIO_FACETS.map((facet) => (
              <Chip key={facet.id} value={facet.id} size="xs" variant="outline">
                {facet.emoji} {facet.label}
              </Chip>
            ))}
          </Group>
        </Chip.Group>

        {activeFacet ? (
          <FacetDetailCard
            facet={activeFacet}
            variantClass={classes.facetCard}
            onSyncCanvasCategory={onSyncCanvasCategory}
          />
        ) : (
          <div className={classes.srFallback}>{fallbackDescription}</div>
        )}
      </Stack>
    </CustomMantineProvider>
  );
}

/**
 * Low-fi Variation B: Collectible Bio Card Deck with discovery progress and shuffle.
 */
export function BioCardDeck({
  fallbackDescription,
  initialFacetId,
  onSyncCanvasCategory,
  onSelectFacet,
}: IBioVariationProps) {
  const initialIndex = initialFacetId ? BIO_FACETS.findIndex((f) => f.id === initialFacetId) : -1;
  const [showOverview, setShowOverview] = useState(initialIndex < 0);
  const [index, setIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [discovered, setDiscovered] = useState<string[]>(() =>
    initialIndex >= 0 ? [BIO_FACETS[initialIndex]!.id] : [],
  );

  const facet = BIO_FACETS[index]!;

  function openIndex(nextIndex: number) {
    const normalized = (nextIndex + BIO_FACETS.length) % BIO_FACETS.length;
    const nextFacet = BIO_FACETS[normalized]!;
    setIndex(normalized);
    setShowOverview(false);
    setDiscovered((prev) => (prev.includes(nextFacet.id) ? prev : [...prev, nextFacet.id]));
    onSelectFacet?.(nextFacet.id, "deck");
  }

  function dealRandom() {
    if (BIO_FACETS.length <= 1) return;
    const candidate =
      (index + 1 + Math.floor(Math.random() * (BIO_FACETS.length - 1))) % BIO_FACETS.length;
    openIndex(candidate);
  }

  const progress = Math.round((discovered.length / BIO_FACETS.length) * 100);

  return (
    <CustomMantineProvider>
      <Stack gap="sm" className={classes.root}>
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <Group gap={6}>
            <Button
              size="compact-xs"
              variant={showOverview ? "filled" : "light"}
              onClick={() => setShowOverview(true)}
            >
              Full bio
            </Button>
            <Button
              size="compact-xs"
              variant={!showOverview ? "filled" : "light"}
              onClick={() => openIndex(index)}
            >
              Deal cards
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={dealRandom}
              aria-label="Deal random card"
            >
              🎲 Shuffle
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            {discovered.length}/{BIO_FACETS.length} unlocked
          </Text>
        </Group>

        <Progress value={progress} size="xs" aria-label="Discovered bio cards" />

        {showOverview ? (
          <div className={classes.srFallback}>{fallbackDescription}</div>
        ) : (
          <Stack gap="xs">
            <FacetDetailCard
              facet={facet}
              variantClass={classes.deckCard}
              onSyncCanvasCategory={onSyncCanvasCategory}
            />
            <Group justify="space-between">
              <Button size="compact-xs" variant="outline" onClick={() => openIndex(index - 1)}>
                ← Prev
              </Button>
              <Text size="xs" c="dimmed">
                Card {index + 1} of {BIO_FACETS.length}
              </Text>
              <Button size="compact-xs" variant="outline" onClick={() => openIndex(index + 1)}>
                Next →
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </CustomMantineProvider>
  );
}
