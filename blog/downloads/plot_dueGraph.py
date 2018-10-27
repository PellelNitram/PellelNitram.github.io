import matplotlib.pyplot as plt
import json
import numpy as np

# Get data
data = json.load(open('dueGraph.dat'))
data_mature = data[0]
data_young = data[1]
data_cumulative = data[2]
data = [data_mature, data_young, data_cumulative]
for d in data:
    d['data'] = np.array(d['data'])

# Plot
fig, ax = plt.subplots()
ax.bar(data_young['data'].T[0], data_young['data'].T[1],
       label=data_young['label'], width=0.9)
ax.bar(data_mature['data'].T[0], data_mature['data'].T[1],
       label=data_mature['label'], width=0.6)
ax.set_xlabel('Days in future')
ax.set_ylabel('Cards')
ax_cumulative = ax.twinx()
ax_cumulative.plot(data_cumulative['data'].T[0], data_cumulative['data'].T[1],
                   color='black', lw=2, label=data_cumulative['label'])
ax_cumulative.set_ylim(0, 120)
ax.legend(loc=[.7, .5], bbox_transform=plt.gcf().transFigure)
ax_cumulative.legend(loc=5)
ax_cumulative.legend(loc=[.7, .5-.1], bbox_transform=plt.gcf().transFigure)
ax.set_title('Forecast')
ax_cumulative.set_ylabel('Cumulative cards')
fig.tight_layout()
plt.savefig('forecast_custom_plot.png', dpi=100)
