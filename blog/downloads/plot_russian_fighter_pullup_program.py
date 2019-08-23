import matplotlib.pyplot as plt
import json
import numpy as np


# The 5RM program from https://www.strongfirst.com/the-fighter-pullup-program-revisited/
data = [
    [ 5, 4, 3, 2, 1 ],
    [ 5, 4, 3, 2, 2 ],
    [ 5, 4, 3, 3, 2 ],
    [ 5, 4, 4, 3, 2 ],
    [ 5, 5, 4, 3, 2 ],
    [ 0, 0, 0, 0, 0 ],
    [ 6, 5, 4, 3, 2 ],
    [ 6, 5, 4, 3, 3 ],
    [ 6, 5, 4, 4, 3 ],
    [ 6, 5, 5, 4, 3 ],
    [ 6, 6, 5, 4, 3 ],
    [ 0, 0, 0, 0, 0 ],
    [ 7, 6, 5, 4, 3 ],
    [ 7, 6, 5, 4, 4 ],
    [ 7, 6, 5, 5, 4 ],
    [ 7, 6, 6, 5, 4 ],
    [ 7, 7, 6, 5, 4 ],
    [ 0, 0, 0, 0, 0 ],
    [ 8, 7, 6, 5, 4 ],
    [ 8, 7, 6, 5, 5 ],
    [ 8, 7, 6, 6, 5 ],
    [ 8, 7, 7, 6, 5 ],
    [ 8, 8, 7, 6, 5 ],
    [ 0, 0, 0, 0, 0 ],
    [ 9, 8, 7, 6, 5 ],
    [ 9, 8, 7, 6, 6 ],
    [ 9, 8, 7, 7, 6 ],
    [ 9, 8, 8, 7, 6 ],
    [ 9, 9, 8, 7, 6 ],
    [ 0, 0, 0, 0, 0 ],
]

data = np.array(data)
days = np.arange(len(data)) + 1

# Plot
fig, ax = plt.subplots()
ax.plot(days, np.sum(data, axis=1), ls='--', color='black', label='Accumulated')
ax.stackplot(days, *data.T, labels=[f'Set nr {i+1}' for i in range(5)])
ax.scatter([days[0], days[-2]], [np.sum(data[0]), np.sum(data[-2])], color='black', s=50)
ax.annotate(f"First day: {np.sum(data[0])} reps", (days[0], np.sum(data[0])), (days[0]+1, np.sum(data[0])+8),
            arrowprops=dict(arrowstyle="<->", connectionstyle="arc3"))
ax.annotate(f"Last day: {np.sum(data[-2])} reps", (days[-2], np.sum(data[-2])), (days[-2]-10, np.sum(data[-2])-2),
            arrowprops=dict(arrowstyle="<->", connectionstyle="arc3"))
ax.set_xlabel('Day into program')
ax.set_ylabel('Number of pullups')
ax.axhline(9, ls=':', c='black')
plt.legend(loc='upper left')
plt.title(f'5 RM Russian Fighter Pullup program: {np.sum(data)} reps')
fig.tight_layout()
plt.savefig('russian_fighter_pullup_program.png', dpi=100)
