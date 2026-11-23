from __future__ import annotations
import torch
from torch import nn


class GlucoseGRU(nn.Module):
    def __init__(self, input_size=3, hidden_size=64, number_of_layers=2, dropout=0.2, output_size=1):
        super().__init__()
        self.gru = nn.GRU(input_size, hidden_size, number_of_layers, batch_first=True, dropout=dropout if number_of_layers > 1 else 0.0)
        self.head = nn.Sequential(nn.Dropout(dropout), nn.Linear(hidden_size, output_size))

    def forward(self, sequence):
        output, _ = self.gru(sequence)
        return self.head(output[:, -1, :])