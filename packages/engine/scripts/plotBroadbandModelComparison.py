"""Plot the source/loss attribution from verifyBroadbandModalResponse.mjs.

Requires matplotlib. This compares raw stationary fields, not normalized
production images, transient behavior, or a claim of visual acceptance.
"""

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.backends.backend_pdf import PdfPages


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    report = json.loads(args.report.read_text())
    attribution = report["sourceModelAttribution"]
    positions = np.array(attribution["positions"])
    xs, ys = np.unique(positions[:, 0]), np.unique(positions[:, 1])
    if len(xs) * len(ys) != len(positions):
        raise ValueError("attribution positions must form a complete XY grid")
    if len(np.unique(positions[:, 2])) != 1:
        raise ValueError("attribution positions must share one Z slice")
    args.output.mkdir(parents=True, exist_ok=True)
    results = attribution["results"]
    selected = [r for r in results if r["frequencyHz"] in (20, 118.4, 1000, 20000)]

    fig, axes = plt.subplots(len(selected), 2, figsize=(10, 12), layout="constrained")
    for row, result in enumerate(selected):
        grids = []
        for model in ("old", "selected"):
            field = np.empty((len(ys), len(xs)))
            for position, value in zip(positions, result[model]["fields"], strict=True):
                field[np.searchsorted(ys, position[1]), np.searchsorted(xs, position[0])] = (
                    value["rawPotential"]
                )
            grids.append(field)
        limit = max(np.max(np.abs(field)) for field in grids)
        for col, (label, field) in enumerate(zip(("Old source model", "Selected source model"), grids)):
            ax = axes[row, col]
            artist = ax.pcolormesh(xs, ys, field, cmap="RdBu_r", vmin=-limit, vmax=limit, shading="nearest")
            ax.set_aspect("equal")
            ax.set_title(f"{label} · {result['frequencyHz']:g} Hz")
            ax.set(xlabel="Normalized x", ylabel="Normalized y")
        fig.colorbar(artist, ax=axes[row, :], label="Raw potential (normalized model units)")
    fig.suptitle(
        f"Source/loss attribution · z = {positions[0, 2]:g}\n"
        "Unit continuous tones · long-time mean · no DC filter or display normalization\n"
        "Equal color scale within each row; scales differ between frequencies",
        fontsize=12,
    )
    fig.savefig(args.output / "source-model-fields.png", dpi=150)

    energy, axes = plt.subplots(1, 2, figsize=(10, 4.5), layout="constrained")
    frequency = [r["frequencyHz"] for r in results]
    for ax, quantity, label in zip(
        axes,
        ("meanPressureEnergy", "meanVelocityEnergy"),
        ("Pressure", "Velocity"),
    ):
        for model, style in (("old", "o-"), ("selected", "s--")):
            ax.loglog(frequency, [r[model][quantity] for r in results], style, label=model)
        ax.set(xlabel="Input frequency (Hz)", ylabel="Raw spatial mean square", title=label)
        ax.grid(True, which="both", alpha=0.2)
        ax.legend()
    energy.suptitle(
        f"Same signed source projection · {attribution['shellCount']} shells / "
        f"{attribution['familyCount']} families\n"
        "Discrete diagnostic tones; connecting lines are visual guides",
        fontsize=12,
    )
    energy.savefig(args.output / "source-model-energy.png", dpi=150)
    with PdfPages(args.output / "source-model-attribution.pdf") as pdf:
        pdf.savefig(fig)
        pdf.savefig(energy)
    plt.close("all")
    print(args.output / "source-model-attribution.pdf")


if __name__ == "__main__":
    main()
