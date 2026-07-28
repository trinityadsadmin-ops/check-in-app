'use client'

import type * as Leaflet from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { LatLngNode } from '@/generated/api/model'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

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
  const selectedIndexRef = useRef(0)
  const nodesRef = useRef<LatLngNode[]>(value.length === 4 ? value : bangkokNodes)
  const onChangeRef = useRef(onChange)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isMapReady, setIsMapReady] = useState(false)

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
        if (disabled) {
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
          draggable: !disabled
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

  function updateNode(index: number, key: keyof LatLngNode, rawValue: string) {
    const parsed = Number(rawValue)

    if (!Number.isFinite(parsed)) {
      return
    }

    const nextNodes = [...nodes]
    const currentNode = nextNodes[index] ?? { lat: 0, lng: 0 }
    nextNodes[index] = {
      ...currentNode,
      [key]: parsed
    }
    if (!disabled) {
      onChange(nextNodes)
    }
  }

  return (
    <div className="grid gap-4">
      <div
        ref={mapElementRef}
        className="isolate h-[360px] overflow-hidden rounded-md border bg-muted"
        aria-label={t('workAreas.mapLabel')}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {nodes.map((node, index) => (
          <Card
            key={index}
            className={cn(
              'gap-3 p-3',
              selectedIndex === index ? 'border-primary bg-accent' : 'bg-background'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">
                {t('workAreas.node')} {index + 1}
              </div>
              <Button
                type="button"
                variant={selectedIndex === index ? 'default' : 'outline'}
                size="sm"
                disabled={disabled}
                onClick={() => setSelectedIndex(index)}
              >
                {t('common.select')}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label htmlFor={`node-${index}-lat`}>{t('workAreas.lat')}</Label>
                <Input
                  id={`node-${index}-lat`}
                  inputMode="decimal"
                  value={node.lat}
                  disabled={disabled}
                  onChange={(event) => updateNode(index, 'lat', event.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`node-${index}-lng`}>{t('workAreas.lng')}</Label>
                <Input
                  id={`node-${index}-lng`}
                  inputMode="decimal"
                  value={node.lng}
                  disabled={disabled}
                  onChange={(event) => updateNode(index, 'lng', event.target.value)}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
