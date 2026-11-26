# Mazury

Mazury is a browser sailing game set on Lake Niegocin. It uses [Slice Engine 1.1](../README.md) from the adjacent `src/` directory in this checkout. The game, assets, and gameplay tests live here.

From this directory, run `npm run serve` and open [Mazury](http://localhost:8090/mazury/). Run `npm test` here for the game suite. From the workspace root, the equivalent commands are `npm --prefix mazury run serve` and `npm --prefix mazury test`.

Start at Ekomarina to practise mooring and stepping ashore, or sail out onto the lake. Use the lake chart to choose another destination.

## Niegocin regatta

Choose **Sail out**, then select **Regatta** for the registration buoy's bearing and range. Sail within 24 m and enter to race three volunteer crews. Raise your main and ease into the shaded starting area to arm a 24-second countdown. The race uses sail power from the warning signal.

Cross the line in the arrow direction at zero, then round the three numbered buoys in order with each buoy to port. The dashed gate at the next buoy shows where to pass. The first leg rewards an efficient tack. On the reaches, trim for speed and plan your turn before you reach the mark. Finish between the two finish buoys and check your result against the fleet.

If you cross early, return fully behind the line and start again. Select **Strict start** at registration for immediate DNF on an early crossing. [Regatta research and game rules](docs/mazury-regatta-research.md)

## Source guide

| Feature | Reference implementation |
| --- | --- |
| Sailing, steering, two sails, heel, capsize recovery, crew ballast, anchoring, and marina manoeuvres | [Sailing simulation](sailing.js), [berths and shore access](harbor.js), [charted ports](ports.js) |
| Surveyed geography, compressed travel, shoreline collisions, relief, and the live chart | [Map workflow](map/README.md), [world projection](lake-world.js), [terrain renderer](terrain.js) |
| Eased zoom, free camera panning, render interpolation, reduced motion, and higher-density displays | [Main loop and camera controls](main.js) |
| Local sun and moon, moving shadows, night lights, and colour grading | [Daylight](daylight.js), [sky clock](sky-clock.js), [terrain shadows](building-shadows.js), [boat lights](boat-overlay.js) |
| Manual wind, moving gusts, automatic weather, rain, lightning, waves, reflections, wakes, spray, and water effects | [Wind field](wind.js), [weather](weather.js), [reflections](reflections.js), [water effects](water.js) |
| Painted yachts and buildings, animated tree boughs, detail models baked in a worker, and art at multiple resolutions | [Art workflow](art/README.md), [yacht poses](yacht-view.js), [tree poses](tree-view.js), [tree worker](tree-detail-worker.js) |
| Birds with feeding, flight and dusk roosting, moving perches, and fish rises | [Bird animation](bird-view.js), [wildlife](wildlife.js), [crows](crows.js), [storks](storks.js) |
| Up to 30 autonomous crews, tacking, collision avoidance, weather diversions, and berth allocation | [Fleet](fleet.js), [routing](fleet-navigation.js), [traffic rules](fleet-traffic.js) |
| Regatta registration, starting signals, course gates, race volunteers and results | [Race rules](regatta.js), [course layout](regatta-course.js), [race display](regatta-view.js) |
| Synthesised engine, thrusters, halyards, water, weather, and soundtrack mixing | [Ambience](ambience.js) |

The [handoff](docs/mazury-handoff.md) records the current controls, verification, and asset sources. The [milestone plan](docs/mazury-plan.md) records the approved gameplay scope.
