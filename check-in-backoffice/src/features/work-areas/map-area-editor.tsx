'use client'

import type * as Leaflet from 'leaflet'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LatLngNode } from '@/generated/api/model'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type PlaceSearchResult = {
  label: string
  lat: number
  lon: number
}

const bangkokNodes: LatLngNode[] = [
  { lat: 13.758, lng: 100.527 },
  { lat: 13.758, lng: 100.532 },
  { lat: 13.754, lng: 100.532 },
  { lat: 13.754, lng: 100.527 }
]

function getCenter(nodes: LatLngNode[]) {
  const sum = nodes.reduce(
    (total, node) => ({
      lat: total.lat + node.lat,
      lng: total.lng + node.lng
    }),
    { lat: 0, lng: 0 }
  )

  return {
    lat: sum.lat / nodes.length,
    lng: sum.lng / nodes.length
  }
}

export function getDefaultAreaNodes() {
  return bangkokNodes
}

type CoordinateFieldProps = {
  id: string
  label: string
  value: number
  disabled?: boolean
  onCommit: (value: number) => void
}

function CoordinateField({ id, label, value, disabled, onCommit }: CoordinateFieldProps) {
  const [draft, setDraft] = useState(() => String(value))
  const isFocusedRef = useRef(false)

  useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(String(value))
    }
  }, [value])

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        className="h-7 px-2 text-xs"
        value={draft}
        disabled={disabled}
        onFocus={() => {
          isFocusedRef.current = true
        }}
        onBlur={() => {
          isFocusedRef.current = false
          setDraft(String(value))
        }}
        onChange={(event) => {
          const rawValue = event.target.value
          setDraft(rawValue)
          const parsed = Number(rawValue)
          if (rawValue.trim() !== '' && Number.isFinite(parsed)) {
            onCommit(parsed)
          }
        }}
      />
    </div>
  )
}

type MapAreaEditorProps = {
  value: LatLngNode[]
  onChange: (nodes: LatLngNode[]) => void
  disabled?: boolean
}

export function MapAreaEditor({ value, onChange, disabled = false }: MapAreaEditorProps) {
  const { t } = useI18n()
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Leaflet.Map | null>(null)
  const leafletRef = useRef<typeof Leaflet | null>(null)
  const polygonRef = useRef<Leaflet.Polygon | null>(null)
  const markersRef = useRef<Leaflet.Marker[]>([])
  const selectedIndexRef = useRef<number | null>(null)
  const nodesRef = useRef<LatLngNode[]>(value.length === 4 ? value : bangkokNodes)
  const onChangeRef = useRef(onChange)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  const nodes = value.length === 4 ? value : bangkokNodes

  useEffect(() => {
    nodesRef.current = nodes
    onChangeRef.current = onChange
  })

  useEffect(() => {
    let isMounted = true

    async function bootMap() {
      if (!mapElementRef.current || mapRef.current) {
        return
      }

      const leaflet = await import('leaflet')

      if (!isMounted || !mapElementRef.current) {
        return
      }

      leafletRef.current = leaflet
      const currentCenter = getCenter(nodesRef.current)
      const map = leaflet
        .map(mapElementRef.current, {
          zoomControl: true,
          attributionControl: true
        })
        .setView([currentCenter.lat, currentCenter.lng], 17)

      leaflet
        .tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        })
        .addTo(map)

      map.on('click', (event) => {
        if (disabled || selectedIndexRef.current === null) {
          return
        }

        const nextNodes = [...nodesRef.current]
        nextNodes[selectedIndexRef.current] = {
          lat: Number(event.latlng.lat.toFixed(6)),
          lng: Number(event.latlng.lng.toFixed(6))
        }
        onChangeRef.current(nextNodes)
      })

      mapRef.current = map
      setIsMapReady(true)
    }

    bootMap()

    return () => {
      isMounted = false
      mapRef.current?.remove()
      mapRef.current = null
      setIsMapReady(false)
      polygonRef.current = null
      markersRef.current = []
    }
  }, [disabled])

  useEffect(() => {
    selectedIndexRef.current = selectedIndex
  }, [selectedIndex])

  useEffect(() => {
    const leaflet = leafletRef.current
    const map = mapRef.current

    if (!leaflet || !map || !isMapReady) {
      return
    }

    polygonRef.current?.remove()
    markersRef.current.forEach((marker) => marker.remove())

    polygonRef.current = leaflet
      .polygon(
        nodes.map((node) => [node.lat, node.lng]),
        {
          color: '#111827',
          fillColor: '#111827',
          fillOpacity: 0.12,
          weight: 2
        }
      )
      .addTo(map)

    markersRef.current = nodes.map((node, index) => {
      const marker = leaflet
        .marker([node.lat, node.lng], {
          icon: leaflet.divIcon({
            className: '',
            html: `<span class="flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-xs font-semibold text-primary-foreground shadow">${index + 1}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          }),
          draggable: !disabled && index !== selectedIndexRef.current
        })
        .addTo(map)

      marker.on('click', () => setSelectedIndex(index))
      marker.on('drag', () => {
        const latLng = marker.getLatLng()
        const nextNodes = [...nodesRef.current]
        nextNodes[index] = {
          lat: Number(latLng.lat.toFixed(6)),
          lng: Number(latLng.lng.toFixed(6))
        }
        nodesRef.current = nextNodes
        polygonRef.current?.setLatLngs(nextNodes.map((node) => [node.lat, node.lng]))
      })
      marker.on('dragend', () => {
        onChangeRef.current(nodesRef.current)
      })

      return marker
    })

    map.fitBounds(polygonRef.current.getBounds(), { padding: [24, 24], maxZoom: 18 })
  }, [disabled, isMapReady, nodes, onChange])

  useEffect(() => {
    markersRef.current.forEach((marker, index) => {
      if (disabled || index === selectedIndex) {
        marker.dragging?.disable()
      } else {
        marker.dragging?.enable()
      }
    })
  }, [selectedIndex, disabled])

  useEffect(() => {
    const query = searchQuery.trim()

    if (query.length < 3) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    const controller = new AbortController()
    setIsSearching(true)

    const timeoutId = setTimeout(() => {
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=th&q=${encodeURIComponent(query)}`,
        { signal: controller.signal }
      )
        .then((response) => response.json())
        .then((data: Array<{ display_name: string; lat: string; lon: string }>) => {
          setSearchResults(
            data.map((item) => ({
              label: item.display_name,
              lat: Number(item.lat),
              lon: Number(item.lon)
            }))
          )
        })
        .catch(() => {
          setSearchResults([])
        })
        .finally(() => {
          setIsSearching(false)
        })
    }, 400)

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [searchQuery])

  function handleSelectSearchResult(result: PlaceSearchResult) {
    mapRef.current?.flyTo([result.lat, result.lon], 17, { duration: 1.2 })
    setSearchQuery(result.label)
    setSearchResults([])
  }

  function updateNode(index: number, key: keyof LatLngNode, parsedValue: number) {
    const nextNodes = [...nodes]
    const currentNode = nextNodes[index] ?? { lat: 0, lng: 0 }
    nextNodes[index] = {
      ...currentNode,
      [key]: parsedValue
    }
    if (!disabled) {
      onChange(nextNodes)
    }
  }

  return (
    <div
      className="relative isolate h-[420px] overflow-hidden rounded-md border bg-muted sm:h-[520px] lg:h-[640px]"
    >
      <div
        ref={mapElementRef}
        className="absolute inset-0"
        aria-label={t('workAreas.mapLabel')}
      />
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] flex flex-col gap-2">
        <div className="pointer-events-auto relative w-full sm:max-w-sm">
          {isSearchFocused && (searchResults.length > 0 || isSearching) ? (
            <Card className="absolute inset-x-0 bottom-full z-10 mb-1 max-h-56 overflow-y-auto border bg-background/95 p-1 shadow-overlay backdrop-blur-sm">
              {isSearching ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t('common.loading')}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t('workAreas.searchPlaceEmpty')}
                </div>
              ) : (
                searchResults.map((result, index) => (
                  <button
                    key={`${result.lat}-${result.lon}-${index}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelectSearchResult(result)}
                    className="block w-full truncate rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    {result.label}
                  </button>
                ))
              )}
            </Card>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              disabled={disabled}
              placeholder={t('workAreas.searchPlacePlaceholder')}
              className="h-8 bg-background/95 pl-7 text-xs shadow-overlay backdrop-blur-sm"
              onChange={(event) => setSearchQuery(event.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {nodes.map((node, index) => (
            <Card
              key={index}
              className={cn(
                'pointer-events-auto gap-2 border bg-background/95 p-2 shadow-overlay backdrop-blur-sm',
                selectedIndex === index ? 'border-primary bg-accent/95' : ''
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium">
                  {t('workAreas.node')} {index + 1}
                </div>
                <Button
                  type="button"
                  variant={selectedIndex === index ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={disabled}
                  onClick={() =>
                    setSelectedIndex((current) => (current === index ? null : index))
                  }
                >
                  {selectedIndex === index ? t('workAreas.unpinNode') : t('workAreas.pinNode')}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <CoordinateField
                  id={`node-${index}-lat`}
                  label={t('workAreas.lat')}
                  value={node.lat}
                  disabled={disabled}
                  onCommit={(parsed) => updateNode(index, 'lat', parsed)}
                />
                <CoordinateField
                  id={`node-${index}-lng`}
                  label={t('workAreas.lng')}
                  value={node.lng}
                  disabled={disabled}
                  onCommit={(parsed) => updateNode(index, 'lng', parsed)}
                />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
