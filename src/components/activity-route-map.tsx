"use client";

import { useEffect, useRef } from "react";
import L, { type LatLngTuple, type Map as LeafletMap, type Polyline as LeafletPolyline, type TileLayer as LeafletTileLayer } from "leaflet";

type LatLngPoint = {
  lat: number;
  lng: number;
};

type ActivityRouteMapProps = {
  points: LatLngPoint[];
  mapKey: string;
};

export function ActivityRouteMap({ points, mapKey }: ActivityRouteMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileLayerRef = useRef<LeafletTileLayer | null>(null);
  const polylineRef = useRef<LeafletPolyline | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Ensure stale Leaflet internals are cleared before creating a new map instance.
    container.innerHTML = "";
    delete (container as { _leaflet_id?: number })._leaflet_id;

    const map = L.map(container, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });

    const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });

    tileLayer.addTo(map);

    mapRef.current = map;
    tileLayerRef.current = tileLayer;

    if (points.length > 0) {
      map.setView([points[0].lat, points[0].lng], 13);
    }

    return () => {
      polylineRef.current?.remove();
      tileLayerRef.current?.remove();
      map.remove();
      polylineRef.current = null;
      tileLayerRef.current = null;
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length < 2) return;

    const latLngs: LatLngTuple[] = points.map((point) => [point.lat, point.lng]);

    if (!polylineRef.current) {
      polylineRef.current = L.polyline(latLngs, {
        color: "#0b8f74",
        weight: 4,
      }).addTo(map);
    } else {
      polylineRef.current.setLatLngs(latLngs);
    }

    map.fitBounds(polylineRef.current.getBounds(), { padding: [24, 24] });
    map.invalidateSize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey, points.length]);

  if (points.length < 2) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-[var(--color-muted)]">
        Route polyline is not available for this activity.
      </div>
    );
  }

  if (typeof window === "undefined") {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-[var(--color-muted)]">
        Loading interactive map...
      </div>
    );
  }


  return <div ref={containerRef} className="h-80 w-full" />;
}
